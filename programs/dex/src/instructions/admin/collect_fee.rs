use crate::states::*;
use crate::utils::*;
use anchor_lang::prelude::*;
use anchor_spl::token::Token;
use anchor_spl::token_interface::Mint;
use anchor_spl::token_interface::Token2022;
use anchor_spl::token_interface::TokenAccount;

#[derive(Accounts)]
pub struct CollectFee<'info> {
    /// Only admin can collect fee now
    #[account(address = config.admin)]
    pub owner: Signer<'info>,
    /// CHECK: dex vault mint authority
    #[account(
        seeds = [
            AUTH_SEED.as_bytes(),
        ],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// Dex state stores accumulated protocol fee amount
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
    /// Config account stores owner
    #[account(address = dex_state.load()?.config)]
    pub config: Account<'info, Config>,
    /// The address that holds dex tokens for token_0
    #[account(
        mut,
        constraint = token_0_vault.key() == dex_state.load()?.token_0_vault
    )]
    pub token_0_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The address that holds dex tokens for token_1
    #[account(
        mut,
        constraint = token_1_vault.key() == dex_state.load()?.token_1_vault
    )]
    pub token_1_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The mint of token_0 vault
    #[account(
        address = token_0_vault.mint
    )]
    pub vault_0_mint: Box<InterfaceAccount<'info, Mint>>,
    /// The mint of token_1 vault
    #[account(
        address = token_1_vault.mint
    )]
    pub vault_1_mint: Box<InterfaceAccount<'info, Mint>>,
    /// The address that receives the collected token_0 protocol fees
    #[account(mut)]
    pub recipient_token_0_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The address that receives the collected token_1 protocol fees
    #[account(mut)]
    pub recipient_token_1_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The SPL program to perform token transfers
    pub token_program: Program<'info, Token>,
    /// The SPL program 2022 to perform token transfers
    pub token_program_2022: Program<'info, Token2022>,
}

pub fn collect_fee(
    ctx: Context<CollectFee>,
    amount_0_requested: u64,
    amount_1_requested: u64,
) -> Result<()> {
    require_gt!(ctx.accounts.token_0_vault.amount, 0);
    require_gt!(ctx.accounts.token_1_vault.amount, 0);

    let mut dex_state = ctx.accounts.dex_state.load_mut()?;

    let (amount_0, amount_1) = if dex_state.is_launched {
        dex_state.swap_fees_token_0 = 0;
        dex_state.swap_fees_token_1 = 0;
        (
            ctx.accounts.token_0_vault.amount,
            ctx.accounts.token_1_vault.amount,
        )
    } else {
        let amount_0 = amount_0_requested.min(dex_state.swap_fees_token_0);
        let amount_1 = amount_1_requested.min(dex_state.swap_fees_token_1);
        dex_state.swap_fees_token_0 = dex_state
            .swap_fees_token_0
            .checked_sub(amount_0)
            .ok_or(crate::error::ErrorCode::Underflow)?;
        dex_state.swap_fees_token_1 = dex_state
            .swap_fees_token_1
            .checked_sub(amount_1)
            .ok_or(crate::error::ErrorCode::Underflow)?;

        (amount_0, amount_1)
    };

    // dex authority pda signer seeds
    let seeds = [AUTH_SEED.as_bytes(), &[dex_state.auth_bump]];
    let signer_seeds = &[seeds.as_slice()];

    transfer_from_dex_vault_to_user(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.token_0_vault.to_account_info(),
        ctx.accounts.recipient_token_0_account.to_account_info(),
        ctx.accounts.vault_0_mint.to_account_info(),
        if ctx.accounts.vault_0_mint.to_account_info().owner == ctx.accounts.token_program.key {
            ctx.accounts.token_program.to_account_info()
        } else {
            ctx.accounts.token_program_2022.to_account_info()
        },
        amount_0,
        ctx.accounts.vault_0_mint.decimals,
        signer_seeds,
    )?;

    transfer_from_dex_vault_to_user(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.token_1_vault.to_account_info(),
        ctx.accounts.recipient_token_1_account.to_account_info(),
        ctx.accounts.vault_1_mint.to_account_info(),
        if ctx.accounts.vault_1_mint.to_account_info().owner == ctx.accounts.token_program.key {
            ctx.accounts.token_program.to_account_info()
        } else {
            ctx.accounts.token_program_2022.to_account_info()
        },
        amount_1,
        ctx.accounts.vault_1_mint.decimals,
        signer_seeds,
    )?;

    dex_state.recent_epoch = Clock::get()?.epoch;

    Ok(())
}
