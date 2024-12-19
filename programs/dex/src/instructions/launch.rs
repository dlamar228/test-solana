use crate::states::PoolState;
use crate::utils::{get_transfer_inverse_fee, token};
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

#[derive(Accounts)]
pub struct Launch<'info> {
    pub raydium_program: Program<'info, raydium_cp_swap::program::RaydiumCpSwap>,

    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [
            raydium_cp_swap::AUTH_SEED.as_bytes(),
        ],
        seeds::program = raydium_program,
        bump,
    )]
    pub raydium_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        address = pool_state.load()?.raydium
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

    /// Lp token mint
    #[account(
        mut,
        address = raydium_pool_state.load()?.lp_mint
    )]
    pub raydium_lp_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of token_0 vault
    #[account(
        address = raydium_token_0_vault.mint
    )]
    pub raydium_token_0_mint: Box<InterfaceAccount<'info, Mint>>,

    /// The mint of token_1 vault
    #[account(
        address = raydium_token_1_vault.mint
    )]
    pub raydium_token_1_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Pays to mint the position
    pub owner: Signer<'info>,

    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// CHECK: pool vault authority
    #[account(
        seeds = [
            crate::AUTH_SEED.as_bytes(),
        ],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,

    /// Owner lp token account
    #[account(mut, token::authority = authority)]
    pub authority_lp_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = token_0_vault.key() == pool_state.load()?.token_0_vault,
        token::authority = authority
    )]
    pub token_0_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = token_1_vault.key() == pool_state.load()?.token_1_vault,
        token::authority = authority
    )]
    pub token_1_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// token Program
    pub token_program: Program<'info, Token>,

    /// Token program 2022
    pub token_program_2022: Program<'info, Token2022>,
}

pub fn launch(ctx: Context<Launch>) -> Result<()> {
    // todo add validation
    let state = ctx.accounts.pool_state.load()?;
    let raydium_lp_supply = ctx.accounts.raydium_pool_state.load()?.lp_supply;

    // pool authority pda signer seeds
    let seeds = [crate::AUTH_SEED.as_bytes(), &[state.auth_bump]];
    let signer_seeds = &[seeds.as_slice()];

    msg!(
        "Before lp_supply: {} lp: {} vault0: {} vault1: {}",
        raydium_lp_supply,
        ctx.accounts.authority_lp_token.amount,
        ctx.accounts.token_0_vault.amount,
        ctx.accounts.token_1_vault.amount
    );

    // send tokens to raydium pool
    {
        let lp_calculator = LpCalculator {
            fees_token_0: state
                .fund_fees_token_1
                .checked_add(state.protocol_fees_token_1)
                .ok_or(crate::error::ErrorCode::Overflow)?,
            fees_token_1: state
                .fund_fees_token_0
                .checked_add(state.protocol_fees_token_0)
                .ok_or(crate::error::ErrorCode::Overflow)?,
            vault_supply_0: ctx.accounts.raydium_token_0_vault.amount,
            vault_supply_1: ctx.accounts.raydium_token_1_vault.amount,
            vault_0: ctx.accounts.token_0_vault.amount,
            vault_1: ctx.accounts.token_1_vault.amount,
            lp_supply: raydium_lp_supply,
            mint_0: ctx.accounts.raydium_token_0_mint.to_account_info(),
            mint_1: ctx.accounts.raydium_token_1_mint.to_account_info(),
        };

        let lp_amount = lp_calculator.calculate()?;

        msg!(
            "LpCalculator: fees_token_0: {} fees_token_1: {} vault_supply_0: {} vault_supply_1: {} vault_0: {} vault_1: {} lp_supply: {} lp_amount: {}",
            lp_calculator.fees_token_0,
            lp_calculator.fees_token_1,
            lp_calculator.vault_supply_0,
            lp_calculator.vault_supply_1,
            lp_calculator.vault_0,
            lp_calculator.vault_1,
            lp_calculator.lp_supply,
            lp_amount,
        );

        let cpi_accounts = raydium_cp_swap::cpi::accounts::Deposit {
            // dex accounts
            owner: ctx.accounts.authority.to_account_info(),
            owner_lp_token: ctx.accounts.authority_lp_token.to_account_info(),
            token_0_account: ctx.accounts.token_0_vault.to_account_info(),
            token_1_account: ctx.accounts.token_1_vault.to_account_info(),
            // raydium accounts
            authority: ctx.accounts.raydium_authority.to_account_info(),
            pool_state: ctx.accounts.raydium_pool_state.to_account_info(),
            token_0_vault: ctx.accounts.raydium_token_0_vault.to_account_info(),
            token_1_vault: ctx.accounts.raydium_token_1_vault.to_account_info(),
            vault_0_mint: ctx.accounts.raydium_token_0_mint.to_account_info(),
            vault_1_mint: ctx.accounts.raydium_token_1_mint.to_account_info(),
            lp_mint: ctx.accounts.raydium_lp_mint.to_account_info(),
            // system programs
            token_program: ctx.accounts.token_program.to_account_info(),
            token_program_2022: ctx.accounts.token_program_2022.to_account_info(),
        };

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.raydium_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );

        raydium_cp_swap::cpi::deposit(cpi_context, lp_amount, u64::MAX, u64::MAX)?;
        ctx.accounts.authority_lp_token.reload()?;
        ctx.accounts.token_0_vault.reload()?;
        ctx.accounts.token_1_vault.reload()?;
    }

    let raydium_lp_supply = ctx.accounts.raydium_pool_state.load()?.lp_supply;
    msg!(
        "After lp_supply: {} lp: {} vault0: {} vault1: {}",
        raydium_lp_supply,
        ctx.accounts.authority_lp_token.amount,
        ctx.accounts.token_0_vault.amount,
        ctx.accounts.token_1_vault.amount
    );

    if ctx.accounts.authority_lp_token.amount != 0 {
        token::token_burn(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.raydium_lp_mint.to_account_info(),
            ctx.accounts.authority_lp_token.to_account_info(),
            ctx.accounts.authority_lp_token.amount,
            signer_seeds,
        )?;
    }

    Ok(())
}

pub struct LpCalculator<'a> {
    pub fees_token_0: u64,
    pub fees_token_1: u64,
    pub vault_supply_0: u64,
    pub vault_supply_1: u64,
    pub vault_0: u64,
    pub vault_1: u64,
    pub lp_supply: u64,
    pub mint_0: AccountInfo<'a>,
    pub mint_1: AccountInfo<'a>,
}

impl<'a> LpCalculator<'a> {
    fn calculate_lp_tokens(
        token_amount: u128,
        token_supply: u128,
        lp_supply: u128,
    ) -> Result<u128> {
        let lp = token_amount
            .checked_mul(lp_supply)
            .ok_or(crate::error::ErrorCode::Overflow)?
            .checked_div(token_supply)
            .ok_or(crate::error::ErrorCode::DivZero)?;

        Ok(lp)
    }
    fn vaults_without_fee(&self, vault_0: u64, vault_1: u64) -> Result<(u64, u64)> {
        let mut clean_vault_0 = vault_0
            .checked_sub(self.fees_token_0)
            .ok_or(crate::error::ErrorCode::Underflow)?;
        let mut clean_vault_1 = vault_1
            .checked_sub(self.fees_token_1)
            .ok_or(crate::error::ErrorCode::Underflow)?;

        let inverse_fee_0 = get_transfer_inverse_fee(&self.mint_0, clean_vault_0)?;
        let inverse_fee_1 = get_transfer_inverse_fee(&self.mint_1, clean_vault_1)?;

        clean_vault_0 = clean_vault_0
            .checked_sub(inverse_fee_0)
            .ok_or(crate::error::ErrorCode::Underflow)?;
        clean_vault_1 = clean_vault_1
            .checked_sub(inverse_fee_1)
            .ok_or(crate::error::ErrorCode::Underflow)?;

        Ok((clean_vault_0, clean_vault_1))
    }
    pub fn calculate(&self) -> Result<u64> {
        let (vault_0, vault_1) = self.vaults_without_fee(self.vault_0, self.vault_1)?;

        let lp = if vault_0 > vault_1 {
            Self::calculate_lp_tokens(
                vault_1 as u128,
                self.vault_supply_1 as u128,
                self.lp_supply as u128,
            )
        } else {
            Self::calculate_lp_tokens(
                vault_0 as u128,
                self.vault_supply_0 as u128,
                self.lp_supply as u128,
            )
        }?;

        let lp = u64::try_from(lp).map_err(|_| crate::error::ErrorCode::InvalidU64Cast)?;

        Ok(lp)
    }
}
