use crate::curve::calculator::CurveCalculator;
use crate::curve::TradeDirection;
use crate::error::ErrorCode;
use crate::states::*;
use crate::utils::token::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use std::cell::RefMut;

pub fn swap_base_input<'info>(
    ctx: &Context<'_, '_, '_, 'info, Swap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    let mut swapper = Swapper::from_ctx(ctx);
    swapper.try_swap_base_input(amount_in, minimum_amount_out)
}

pub fn swap_base_output<'info>(
    ctx: &Context<'_, '_, '_, 'info, Swap<'info>>,
    max_amount_in: u64,
    amount_out_less_fee: u64,
) -> Result<()> {
    let mut swapper = Swapper::from_ctx(ctx);
    swapper.try_swap_base_output(max_amount_in, amount_out_less_fee)
}

#[derive(Accounts)]
pub struct Swap<'info> {
    /// The user performing the swap
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            DEX_CONFIG_SEED.as_bytes(),
        ],
        bump = config.bump
    )]
    pub config: Box<Account<'info, ConfigState>>,
    #[account(
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    /// CHECK: dex vault authority
    #[account(
        seeds = [
            DEX_AUTHORITY_SEED.as_bytes(),
        ],
        bump = authority_manager.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// The program account of the dex in which the swap will be performed
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
    /// The user token account for input token
    #[account(mut)]
    pub input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The user token account for output token
    #[account(mut)]
    pub output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The vault token account for input token
    #[account(
        mut,
        constraint = input_vault.key() == dex_state.load()?.token_0_vault || input_vault.key() == dex_state.load()?.token_1_vault
    )]
    pub input_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The vault token account for output token
    #[account(
        mut,
        constraint = output_vault.key() == dex_state.load()?.token_0_vault || output_vault.key() == dex_state.load()?.token_1_vault
    )]
    pub output_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// SPL program for input token transfers
    pub input_token_program: Interface<'info, TokenInterface>,
    /// SPL program for output token transfers
    pub output_token_program: Interface<'info, TokenInterface>,
    /// The mint of input token
    #[account(
        address = input_vault.mint
    )]
    pub input_token_mint: Box<InterfaceAccount<'info, Mint>>,
    /// The mint of output token
    #[account(
        address = output_vault.mint
    )]
    pub output_token_mint: Box<InterfaceAccount<'info, Mint>>,
}

pub struct Swapper<'info> {
    authority: UncheckedAccount<'info>,
    authority_manager: Box<Account<'info, AuthorityManager>>,
    config: Box<Account<'info, ConfigState>>,
    dex_state: AccountLoader<'info, DexState>,
    input_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    output_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    input_token_program: Interface<'info, TokenInterface>,
    output_token_program: Interface<'info, TokenInterface>,
    input_token_mint: Box<InterfaceAccount<'info, Mint>>,
    output_token_mint: Box<InterfaceAccount<'info, Mint>>,
    input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    payer: Signer<'info>,
}

impl<'info> Swapper<'info> {
    pub fn from_ctx(ctx: &Context<'_, '_, '_, 'info, Swap<'info>>) -> Self {
        Self {
            authority: ctx.accounts.authority.clone(),
            authority_manager: ctx.accounts.authority_manager.clone(),
            config: ctx.accounts.config.clone(),
            dex_state: ctx.accounts.dex_state.clone(),
            input_vault: ctx.accounts.input_vault.clone(),
            output_vault: ctx.accounts.output_vault.clone(),
            input_token_program: ctx.accounts.input_token_program.clone(),
            output_token_program: ctx.accounts.output_token_program.clone(),
            input_token_mint: ctx.accounts.input_token_mint.clone(),
            output_token_mint: ctx.accounts.output_token_mint.clone(),
            input_token_account: ctx.accounts.input_token_account.clone(),
            output_token_account: ctx.accounts.output_token_account.clone(),
            payer: ctx.accounts.payer.clone(),
        }
    }
    fn calculate_trade_amounts_and_price_before_swap(
        &self,
        dex_state: &mut RefMut<'_, DexState>,
    ) -> Result<SwapCalculation> {
        let (
            trade_direction,
            total_input_token_amount,
            total_output_token_amount,
            token_0_price_x64,
            token_1_price_x64,
        ) = match (self.input_vault.key(), self.output_vault.key()) {
            (input, output)
                if input == dex_state.token_0_vault && output == dex_state.token_1_vault =>
            {
                let (total_input_token_amount, total_output_token_amount) = dex_state
                    .vault_amount_without_fee(self.input_vault.amount, self.output_vault.amount);
                let (token_0_price_x64, token_1_price_x64) =
                    dex_state.token_price_x32(self.input_vault.amount, self.output_vault.amount);

                (
                    TradeDirection::ZeroForOne,
                    total_input_token_amount,
                    total_output_token_amount,
                    token_0_price_x64,
                    token_1_price_x64,
                )
            }
            (input, output)
                if input == dex_state.token_1_vault && output == dex_state.token_0_vault =>
            {
                let (total_output_token_amount, total_input_token_amount) = dex_state
                    .vault_amount_without_fee(self.output_vault.amount, self.input_vault.amount);
                let (token_0_price_x64, token_1_price_x64) =
                    dex_state.token_price_x32(self.output_vault.amount, self.input_vault.amount);

                (
                    TradeDirection::OneForZero,
                    total_input_token_amount,
                    total_output_token_amount,
                    token_0_price_x64,
                    token_1_price_x64,
                )
            }
            _ => {
                return err!(ErrorCode::InvalidVault);
            }
        };

        Ok(SwapCalculation {
            trade_direction,
            total_input_token_amount,
            total_output_token_amount,
            token_0_price_x64,
            token_1_price_x64,
        })
    }
    pub fn try_swap_base_input(&mut self, amount_in: u64, minimum_amount_out: u64) -> Result<()> {
        let dex_id = self.dex_state.key();
        let dex_state = &mut self.dex_state.load_mut()?;

        if dex_state.is_launched {
            return err!(ErrorCode::DexReadyToLaunch);
        }

        if dex_state.is_launched {
            return err!(ErrorCode::DexLaunched);
        }

        let transfer_fee = get_transfer_fee(&self.input_token_mint.to_account_info(), amount_in)?;
        // Take transfer fees into account for actual amount transferred in
        let actual_amount_in = amount_in.saturating_sub(transfer_fee);
        require_gt!(actual_amount_in, 0);

        let SwapCalculation {
            trade_direction,
            total_input_token_amount,
            total_output_token_amount,
            ..
        } = self.calculate_trade_amounts_and_price_before_swap(dex_state)?;

        let result = CurveCalculator::swap_base_input(
            u128::from(actual_amount_in),
            u128::from(total_input_token_amount),
            u128::from(total_output_token_amount),
            self.config.swap_fee_rate,
        )
        .ok_or(ErrorCode::ZeroTradingTokens)?;

        #[cfg(feature = "enable-log")]
        msg!(
            "swap source_amount_swapped:{}, destination_amount_swapped:{}, protocol_fee:{}, constant_before:{}, constant_after:{}, base_input:{}",
            result.source_amount_swapped,
            result.destination_amount_swapped,
            result.protocol_fee,
            result.constant_before,
            result.constant_after,
            true
        );

        require_eq!(
            u64::try_from(result.source_amount_swapped).unwrap(),
            actual_amount_in
        );

        let (input_transfer_amount, input_transfer_fee) = (amount_in, transfer_fee);
        let (output_transfer_amount, output_transfer_fee) = {
            let amount_out = u64::try_from(result.destination_amount_swapped).unwrap();
            let transfer_fee =
                get_transfer_fee(&self.output_token_mint.to_account_info(), amount_out)?;
            let amount_received = amount_out.checked_sub(transfer_fee).unwrap();
            require_gt!(amount_received, 0);
            require_gte!(
                amount_received,
                minimum_amount_out,
                ErrorCode::ExceededSlippage
            );
            (amount_out, transfer_fee)
        };

        let protocol_fee = u64::try_from(result.protocol_fee).unwrap();

        match trade_direction {
            TradeDirection::ZeroForOne => {
                dex_state.swap_fees_token_0 = dex_state
                    .swap_fees_token_0
                    .checked_add(protocol_fee)
                    .unwrap();
            }
            TradeDirection::OneForZero => {
                dex_state.swap_fees_token_1 = dex_state
                    .swap_fees_token_1
                    .checked_add(protocol_fee)
                    .unwrap();
            }
        };

        require_gte!(result.constant_after, result.constant_before);

        transfer_from_user_to_dex_vault(
            self.payer.to_account_info(),
            self.input_token_account.to_account_info(),
            self.input_vault.to_account_info(),
            self.input_token_mint.to_account_info(),
            self.input_token_program.to_account_info(),
            input_transfer_amount,
            self.input_token_mint.decimals,
        )?;

        // dex authority pda signer seeds
        let seeds = [
            DEX_AUTHORITY_SEED.as_bytes(),
            &[self.authority_manager.authority_bump],
        ];
        let signer_seeds = &[seeds.as_slice()];

        transfer_from_dex_vault_to_user(
            self.authority.to_account_info(),
            self.output_vault.to_account_info(),
            self.output_token_account.to_account_info(),
            self.output_token_mint.to_account_info(),
            self.output_token_program.to_account_info(),
            output_transfer_amount,
            self.output_token_mint.decimals,
            signer_seeds,
        )?;

        self.input_vault.reload()?;
        self.output_vault.reload()?;

        let vault_reserve_amount = dex_state.get_vault_reserve_amount(
            self.input_vault.amount,
            self.output_vault.amount,
            trade_direction,
        );

        let remaining_tokens = dex_state.get_remaining_tokens(vault_reserve_amount);

        emit!(SwapEvent {
            dex_id,
            input_vault_before: total_input_token_amount,
            output_vault_before: total_output_token_amount,
            input_amount: u64::try_from(result.source_amount_swapped).unwrap(),
            output_amount: u64::try_from(result.destination_amount_swapped).unwrap(),
            input_transfer_fee,
            output_transfer_fee,
            remaining_tokens,
            base_input: true,
            zero_to_one: trade_direction.into(),
        });

        if dex_state.is_reached_reserve_bound(vault_reserve_amount) {
            dex_state.is_ready_to_launch = true;
            emit!(DexIsReadyToLaunchEvent { dex_id });
        }

        Ok(())
    }
    pub fn try_swap_base_output(
        &mut self,
        max_amount_in: u64,
        amount_out_less_fee: u64,
    ) -> Result<()> {
        let dex_id = self.dex_state.key();
        let dex_state = &mut self.dex_state.load_mut()?;

        if dex_state.is_launched {
            return err!(ErrorCode::DexReadyToLaunch);
        }

        if dex_state.is_launched {
            return err!(ErrorCode::DexLaunched);
        }

        let out_transfer_fee = get_transfer_inverse_fee(
            &self.output_token_mint.to_account_info(),
            amount_out_less_fee,
        )?;
        let actual_amount_out = amount_out_less_fee.checked_add(out_transfer_fee).unwrap();

        let SwapCalculation {
            trade_direction,
            total_input_token_amount,
            total_output_token_amount,
            ..
        } = self.calculate_trade_amounts_and_price_before_swap(dex_state)?;

        let result = CurveCalculator::swap_base_output(
            u128::from(actual_amount_out),
            u128::from(total_input_token_amount),
            u128::from(total_output_token_amount),
            self.config.swap_fee_rate,
        )
        .ok_or(ErrorCode::ZeroTradingTokens)?;

        // Re-calculate the source amount swapped based on what the curve says
        let (input_transfer_amount, input_transfer_fee) = {
            let source_amount_swapped = u64::try_from(result.source_amount_swapped).unwrap();
            require_gt!(source_amount_swapped, 0);
            let transfer_fee = get_transfer_inverse_fee(
                &self.input_token_mint.to_account_info(),
                source_amount_swapped,
            )?;
            let input_transfer_amount = source_amount_swapped.checked_add(transfer_fee).unwrap();
            require_gte!(
                max_amount_in,
                input_transfer_amount,
                ErrorCode::ExceededSlippage
            );
            (input_transfer_amount, transfer_fee)
        };
        require_eq!(
            u64::try_from(result.destination_amount_swapped).unwrap(),
            actual_amount_out
        );
        let (output_transfer_amount, output_transfer_fee) = (actual_amount_out, out_transfer_fee);

        let protocol_fee = u64::try_from(result.protocol_fee).unwrap();

        match trade_direction {
            TradeDirection::ZeroForOne => {
                dex_state.swap_fees_token_0 = dex_state
                    .swap_fees_token_0
                    .checked_add(protocol_fee)
                    .unwrap();
            }
            TradeDirection::OneForZero => {
                dex_state.swap_fees_token_1 = dex_state
                    .swap_fees_token_1
                    .checked_add(protocol_fee)
                    .unwrap();
            }
        };

        require_gte!(result.constant_after, result.constant_before);
        transfer_from_user_to_dex_vault(
            self.payer.to_account_info(),
            self.input_token_account.to_account_info(),
            self.input_vault.to_account_info(),
            self.input_token_mint.to_account_info(),
            self.input_token_program.to_account_info(),
            input_transfer_amount,
            self.input_token_mint.decimals,
        )?;

        // dex authority pda signer seeds
        let seeds = [
            DEX_AUTHORITY_SEED.as_bytes(),
            &[self.authority_manager.authority_bump],
        ];
        let signer_seeds = &[seeds.as_slice()];

        transfer_from_dex_vault_to_user(
            self.authority.to_account_info(),
            self.output_vault.to_account_info(),
            self.output_token_account.to_account_info(),
            self.output_token_mint.to_account_info(),
            self.output_token_program.to_account_info(),
            output_transfer_amount,
            self.output_token_mint.decimals,
            signer_seeds,
        )?;

        self.input_vault.reload()?;
        self.output_vault.reload()?;

        let vault_reserve_amount = dex_state.get_vault_reserve_amount(
            self.input_vault.amount,
            self.output_vault.amount,
            trade_direction,
        );

        let remaining_tokens = dex_state.get_remaining_tokens(vault_reserve_amount);

        emit!(SwapEvent {
            dex_id,
            input_vault_before: total_input_token_amount,
            output_vault_before: total_output_token_amount,
            input_amount: u64::try_from(result.source_amount_swapped).unwrap(),
            output_amount: u64::try_from(result.destination_amount_swapped).unwrap(),
            input_transfer_fee,
            output_transfer_fee,
            remaining_tokens,
            base_input: false,
            zero_to_one: trade_direction.into(),
        });

        if dex_state.is_reached_reserve_bound(vault_reserve_amount) {
            dex_state.is_ready_to_launch = true;
            emit!(DexIsReadyToLaunchEvent { dex_id });
        }

        Ok(())
    }
}

pub struct SwapCalculation {
    pub trade_direction: TradeDirection,
    pub total_input_token_amount: u64,
    pub total_output_token_amount: u64,
    pub token_0_price_x64: u128,
    pub token_1_price_x64: u128,
}
