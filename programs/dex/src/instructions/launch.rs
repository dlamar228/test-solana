use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

use crate::states::PoolState;
use crate::utils::token;

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

    #[account(mut)]
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
    let cpi_accounts = raydium_cp_swap::cpi::accounts::Deposit {
        owner: ctx.accounts.owner.to_account_info(),
        owner_lp_token: ctx.accounts.authority.to_account_info(),
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

    // pool authority pda signer seeds
    let seeds = [crate::AUTH_SEED.as_bytes(), &[state.auth_bump]];
    let signer_seeds = &[seeds.as_slice()];

    // send tokens to raydium pool
    {
        // todo: calculate in ahead
        let lp_token_amount = 10;
        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.raydium_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        raydium_cp_swap::cpi::deposit(cpi_context, lp_token_amount, u64::MAX, u64::MAX)?;
    }

    ctx.accounts.authority_lp_token.reload()?;
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
