use crate::curve::calculator::CurveCalculator;
use crate::curve::Fees;
use crate::curve::TradeDirection;
use crate::error::ErrorCode;
use crate::states::*;
use crate::utils::token::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use std::cell::RefMut;

#[derive(Accounts)]
pub struct Swap<'info> {
    /// The user performing the swap
    pub payer: Signer<'info>,
    /// CHECK: dex vault authority
    #[account(
        seeds = [
            crate::AUTH_SEED.as_bytes(),
        ],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// The factory state to read protocol fees
    #[account(address = dex_state.load()?.amm_config)]
    pub amm_config: Box<Account<'info, AmmConfig>>,
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
    #[account(
        address = dex_state.load()?.raydium
    )]
    pub raydium_pool_state: AccountLoader<'info, raydium_cp_swap::states::pool::PoolState>,
    /// The address that holds pool tokens for token_0
    #[account(
        mut,
        constraint = raydium_token_0_vault.key() == raydium_pool_state.load()?.token_0_vault
    )]
    pub raydium_token_0_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The address that holds pool tokens for token_1
    #[account(
        mut,
        constraint = raydium_token_1_vault.key() == raydium_pool_state.load()?.token_1_vault
    )]
    pub raydium_token_1_vault: Box<InterfaceAccount<'info, TokenAccount>>,
}

pub fn swap_base_input<'info>(
    ctx: &Context<'_, '_, '_, 'info, Swap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    let mut swap_and_launch = SwapAndLaunch::from_ctx(ctx);
    let trade_direction = swap_and_launch.try_swap_base_input(amount_in, minimum_amount_out)?;
    swap_and_launch.try_launch(trade_direction)
}

pub struct SwapCalculation {
    pub trade_direction: TradeDirection,
    pub total_input_token_amount: u64,
    pub total_output_token_amount: u64,
    pub token_0_price_x64: u128,
    pub token_1_price_x64: u128,
}

pub struct SwapAndLaunch<'info> {
    authority: UncheckedAccount<'info>,
    dex_state: AccountLoader<'info, DexState>,
    amm_config: Box<Account<'info, AmmConfig>>,
    input_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    output_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    input_token_program: Interface<'info, TokenInterface>,
    output_token_program: Interface<'info, TokenInterface>,
    input_token_mint: Box<InterfaceAccount<'info, Mint>>,
    output_token_mint: Box<InterfaceAccount<'info, Mint>>,
    raydium_pool_state: AccountLoader<'info, raydium_cp_swap::states::pool::PoolState>,
    raydium_token_0_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    raydium_token_1_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    input_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    output_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    payer: Signer<'info>,
}

impl<'info> SwapAndLaunch<'info> {
    pub fn from_ctx(ctx: &Context<'_, '_, '_, 'info, Swap<'info>>) -> Self {
        Self {
            authority: ctx.accounts.authority.clone(),
            dex_state: ctx.accounts.dex_state.clone(),
            amm_config: ctx.accounts.amm_config.clone(),
            input_vault: ctx.accounts.input_vault.clone(),
            output_vault: ctx.accounts.output_vault.clone(),
            input_token_program: ctx.accounts.input_token_program.clone(),
            output_token_program: ctx.accounts.output_token_program.clone(),
            input_token_mint: ctx.accounts.input_token_mint.clone(),
            output_token_mint: ctx.accounts.output_token_mint.clone(),
            raydium_pool_state: ctx.accounts.raydium_pool_state.clone(),
            raydium_token_0_vault: ctx.accounts.raydium_token_0_vault.clone(),
            raydium_token_1_vault: ctx.accounts.raydium_token_1_vault.clone(),
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
    pub fn try_swap_base_input(
        &mut self,
        amount_in: u64,
        minimum_amount_out: u64,
    ) -> Result<TradeDirection> {
        let block_timestamp = solana_program::clock::Clock::get()?.unix_timestamp as u64;
        let dex_id = self.dex_state.key();
        let dex_state = &mut self.dex_state.load_mut()?;

        if block_timestamp < dex_state.open_time {
            return err!(ErrorCode::NotApproved);
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
            token_0_price_x64,
            token_1_price_x64,
        } = self.calculate_trade_amounts_and_price_before_swap(dex_state)?;

        let constant_before = u128::from(total_input_token_amount)
            .checked_mul(u128::from(total_output_token_amount))
            .unwrap();

        let result = CurveCalculator::swap_base_input(
            u128::from(actual_amount_in),
            u128::from(total_input_token_amount),
            u128::from(total_output_token_amount),
            self.amm_config.protocol_fee_rate,
        )
        .ok_or(ErrorCode::ZeroTradingTokens)?;

        let constant_after = result
            .new_swap_source_amount
            .checked_sub(result.protocol_fee)
            .unwrap()
            .checked_mul(result.new_swap_destination_amount)
            .unwrap();

        #[cfg(feature = "enable-log")]
        msg!(
            "source_amount_swapped:{}, destination_amount_swapped:{}, protocol_fee:{}, constant_before:{},constant_after:{}",
            result.source_amount_swapped,
            result.destination_amount_swapped,
            result.protocol_fee,
            constant_before,
            constant_after
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
                dex_state.protocol_fees_token_0 = dex_state
                    .protocol_fees_token_0
                    .checked_add(protocol_fee)
                    .unwrap();
            }
            TradeDirection::OneForZero => {
                dex_state.protocol_fees_token_1 = dex_state
                    .protocol_fees_token_1
                    .checked_add(protocol_fee)
                    .unwrap();
            }
        };

        emit!(SwapEvent {
            dex_id,
            input_vault_before: total_input_token_amount,
            output_vault_before: total_output_token_amount,
            input_amount: u64::try_from(result.source_amount_swapped).unwrap(),
            output_amount: u64::try_from(result.destination_amount_swapped).unwrap(),
            input_transfer_fee,
            output_transfer_fee,
            base_input: true
        });
        require_gte!(constant_after, constant_before);

        emit!(MarketCapEvent {
            dex_id,
            price_0: u64::try_from(token_0_price_x64).unwrap(),
            price_1: u64::try_from(token_1_price_x64).unwrap(),
        });

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
        let seeds = [crate::AUTH_SEED.as_bytes(), &[dex_state.auth_bump]];
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

        dex_state.recent_epoch = Clock::get()?.epoch;

        Ok(trade_direction)
    }
    pub fn try_swap_base_output(
        &mut self,
        max_amount_in: u64,
        amount_out_less_fee: u64,
    ) -> Result<TradeDirection> {
        let block_timestamp = solana_program::clock::Clock::get()?.unix_timestamp as u64;
        let dex_id = self.dex_state.key();
        let dex_state = &mut self.dex_state.load_mut()?;
        if block_timestamp < dex_state.open_time {
            return err!(ErrorCode::NotApproved);
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
            token_0_price_x64,
            token_1_price_x64,
        } = self.calculate_trade_amounts_and_price_before_swap(dex_state)?;

        let constant_before = u128::from(total_input_token_amount)
            .checked_mul(u128::from(total_output_token_amount))
            .unwrap();

        let result = CurveCalculator::swap_base_output(
            u128::from(actual_amount_out),
            u128::from(total_input_token_amount),
            u128::from(total_output_token_amount),
            self.amm_config.protocol_fee_rate,
        )
        .ok_or(ErrorCode::ZeroTradingTokens)?;

        let constant_after = result
            .new_swap_source_amount
            .checked_sub(result.protocol_fee)
            .unwrap()
            .checked_mul(result.new_swap_destination_amount)
            .unwrap();

        #[cfg(feature = "enable-log")]
        msg!(
            "source_amount_swapped:{}, destination_amount_swapped:{}, protocol_fee:{}, constant_before:{},constant_after:{}",
            result.source_amount_swapped,
            result.destination_amount_swapped,
            result.protocol_fee,
            constant_before,
            constant_after
        );

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
                dex_state.protocol_fees_token_0 = dex_state
                    .protocol_fees_token_0
                    .checked_add(protocol_fee)
                    .unwrap();
            }
            TradeDirection::OneForZero => {
                dex_state.protocol_fees_token_1 = dex_state
                    .protocol_fees_token_1
                    .checked_add(protocol_fee)
                    .unwrap();
            }
        };

        emit!(SwapEvent {
            dex_id,
            input_vault_before: total_input_token_amount,
            output_vault_before: total_output_token_amount,
            input_amount: u64::try_from(result.source_amount_swapped).unwrap(),
            output_amount: u64::try_from(result.destination_amount_swapped).unwrap(),
            input_transfer_fee,
            output_transfer_fee,
            base_input: false
        });
        require_gte!(constant_after, constant_before);

        emit!(MarketCapEvent {
            dex_id,
            price_0: u64::try_from(token_0_price_x64).unwrap(),
            price_1: u64::try_from(token_1_price_x64).unwrap(),
        });

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
        let seeds = [crate::AUTH_SEED.as_bytes(), &[dex_state.auth_bump]];
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

        dex_state.recent_epoch = Clock::get()?.epoch;

        Ok(trade_direction)
    }
    pub fn try_launch(&mut self, trade_direction: TradeDirection) -> Result<()> {
        self.input_vault.reload()?;
        self.output_vault.reload()?;

        let current_reserve = match trade_direction {
            TradeDirection::ZeroForOne => self.input_vault.amount,
            TradeDirection::OneForZero => self.output_vault.amount,
        };

        let state = &mut self.dex_state.load_mut()?;

        if state.vault_0_reserve_bound > current_reserve {
            emit!(RemainingTokensAvailableEvent {
                dex_id: self.dex_state.key(),
                remaining_tokens: state.vault_0_reserve_bound - current_reserve,
            });
            return Ok(());
        }

        state.is_launched = true;

        let launch_fee_rates = self.amm_config.launch_fee_rate;
        let (vault_0, mint_0, program_0, vault_1, mint_1, program_1) = match trade_direction {
            TradeDirection::ZeroForOne => (
                &self.input_vault,
                &self.input_token_mint,
                &self.input_token_program,
                &self.output_vault,
                &self.output_token_mint,
                &self.output_token_program,
            ),
            TradeDirection::OneForZero => (
                &self.output_vault,
                &self.output_token_mint,
                &self.output_token_program,
                &self.input_vault,
                &self.input_token_mint,
                &self.input_token_program,
            ),
        };

        let taxed_amount_0 = {
            let clean_vault_0 = vault_0
                .amount
                .checked_sub(state.protocol_fees_token_0)
                .ok_or(ErrorCode::Underflow)?;

            let launch_tax =
                u64::try_from(Fees::protocol_fee(clean_vault_0 as u128, launch_fee_rates).unwrap())
                    .map_err(|_| ErrorCode::InvalidU64Cast)?;
            #[cfg(feature = "enable-log")]
            msg!(
                "vault_0: {}, clean_vault_0: {}, launch_tax_0: {}",
                vault_0.amount,
                clean_vault_0,
                launch_tax
            );
            clean_vault_0
                .checked_sub(launch_tax)
                .ok_or(ErrorCode::Underflow)?
        };

        let taxed_amount_1 = {
            let clean_vault_1 = vault_1
                .amount
                .checked_sub(state.protocol_fees_token_1)
                .ok_or(ErrorCode::Underflow)?;

            let launch_tax =
                u64::try_from(Fees::protocol_fee(clean_vault_1 as u128, launch_fee_rates).unwrap())
                    .map_err(|_| ErrorCode::InvalidU64Cast)?;

            #[cfg(feature = "enable-log")]
            msg!(
                "vault_1: {}, clean_vault_1: {}, launch_tax_1: {}",
                vault_1.amount,
                clean_vault_1,
                launch_tax
            );

            clean_vault_1
                .checked_sub(launch_tax)
                .ok_or(ErrorCode::Underflow)?
        };

        let seeds = [crate::AUTH_SEED.as_bytes(), &[state.auth_bump]];
        let signer_seeds = &[seeds.as_slice()];

        transfer_from_dex_vault_to_user(
            self.authority.to_account_info(),
            vault_0.to_account_info(),
            self.raydium_token_0_vault.to_account_info(),
            mint_0.to_account_info(),
            program_0.to_account_info(),
            taxed_amount_0,
            mint_0.decimals,
            signer_seeds,
        )?;

        transfer_from_dex_vault_to_user(
            self.authority.to_account_info(),
            vault_1.to_account_info(),
            self.raydium_token_1_vault.to_account_info(),
            mint_1.to_account_info(),
            program_1.to_account_info(),
            taxed_amount_1,
            mint_1.decimals,
            signer_seeds,
        )?;

        emit!(TokenLaunchedEvent {
            dex_id: self.dex_state.key(),
            raydium_id: self.raydium_pool_state.key(),
            amount_0: taxed_amount_0,
            amount_1: taxed_amount_1
        });

        Ok(())
    }
}
