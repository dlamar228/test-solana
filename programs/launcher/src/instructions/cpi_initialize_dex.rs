use crate::{
    states::{AuthorityManager, ConfigState},
    utils::TokenUtils,
};

use super::*;

use anchor_lang::solana_program::{
    program::{invoke, invoke_signed},
    program_pack::Pack,
    system_instruction,
};

use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_2022::spl_token_2022,
    token_interface::{Mint, Token2022, TokenAccount, TokenInterface},
};

pub fn cpi_initialize_dex(ctx: Context<CpiInitializeDex>) -> Result<()> {
    let seeds = [
        LAUNCHER_AUTHORITY_SEED.as_bytes(),
        &[ctx.accounts.authority_manager.authority_bump],
    ];
    let signer_seeds = &[seeds.as_slice()];

    let mut rest_token_amount = MAX_TOKEN_SUPPLY;

    let token_utils = TokenUtils {
        mint: ctx.accounts.mint_authority.to_account_info(),
        decimals: ctx.accounts.mint_authority.decimals,
        token_program: ctx.accounts.token_program_authority.to_account_info(),
    };

    token_utils.mint_to(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.team_vault.to_account_info(),
        ctx.accounts.config.team_tokens,
        signer_seeds,
    )?;

    rest_token_amount -= ctx.accounts.config.team_tokens;

    token_utils.mint_to(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.payer_vault_authority.to_account_info(),
        rest_token_amount,
        signer_seeds,
    )?;

    let vault_for_reserve_bound;
    let (
        payer_vault_zero,
        payer_vault_one,
        mint_zero,
        mint_one,
        token_program_zero,
        token_program_one,
        dex_vault_zero,
        dex_vault_one,
    ) = if ctx.accounts.mint_authority.key() > ctx.accounts.mint.key() {
        vault_for_reserve_bound = true;
        (
            ctx.accounts.payer_vault.to_account_info(),
            ctx.accounts.payer_vault_authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program_authority.to_account_info(),
            ctx.accounts.dex_vault.to_account_info(),
            ctx.accounts.dex_vault_authority.to_account_info(),
        )
    } else {
        vault_for_reserve_bound = false;
        (
            ctx.accounts.payer_vault_authority.to_account_info(),
            ctx.accounts.payer_vault.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.token_program_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.dex_vault_authority.to_account_info(),
            ctx.accounts.dex_vault.to_account_info(),
        )
    };

    let cpi_accounts = dex::cpi::accounts::InitializeDex {
        cpi_authority: ctx.accounts.authority.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        config: ctx.accounts.dex_config.to_account_info(),
        authority_manager: ctx.accounts.dex_authority_manager.to_account_info(),
        authority: ctx.accounts.dex_authority.to_account_info(),
        dex_state: ctx.accounts.dex_state.to_account_info(),
        mint_zero,
        mint_one,
        payer_vault_zero,
        payer_vault_one,
        dex_vault_zero,
        dex_vault_one,
        token_program_zero,
        token_program_one,
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.dex_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    dex::cpi::initialize_dex(
        cpi_context,
        rest_token_amount,
        vault_for_reserve_bound,
        false,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct CpiInitializeDex<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = payer,
        associated_token::token_program = token_program_payer,
    )]
    pub payer_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: payer zero mint account
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_authority,
        associated_token::authority = payer,
        associated_token::token_program = token_program_authority,
    )]
    pub payer_vault_authority: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: faucet vault authority
    #[account(
        mut,
        seeds = [
            LAUNCHER_AUTHORITY_SEED.as_bytes(),
        ],
        bump = authority_manager.authority_bump,
    )]
    pub authority: AccountInfo<'info>,
    #[account(
        seeds = [
            LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump = authority_manager.bump,
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    #[account(
        seeds = [LAUNCHER_CONFIG_SEED.as_bytes(),],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ConfigState>>,
    /// CHECK: dex program
    #[account(
        address = authority_manager.faucet_authority
    )]
    pub faucet_authority: UncheckedAccount<'info>,
    /// CHECK: dex program
    pub dex_program: UncheckedAccount<'info>,
    /// CHECK: dex config
    pub dex_config: Box<Account<'info, dex::states::ConfigState>>,
    /// CHECK: dex authority manager
    pub dex_authority_manager: UncheckedAccount<'info>,
    /// CHECK: dex authority
    pub dex_authority: UncheckedAccount<'info>,
    /// CHECK: dex_state
    #[account(mut)]
    pub dex_state: UncheckedAccount<'info>,
    /// CHECK: zero mint account vault for the dex
    #[account(mut)]
    pub dex_vault_authority: UncheckedAccount<'info>,
    /// CHECK: one mint account vault for the dex
    #[account(mut)]
    pub dex_vault: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        token::mint = mint_authority,
        token::authority = authority,
        token::token_program = token_program_authority,
        payer = payer,
        seeds = [LAUNCHER_TEAM_VAULT_SEED.as_bytes(), mint_authority.key().as_ref()],
        bump,
    )]
    pub team_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: dex zero mint
    #[account(
        mut,
        mint::token_program = token_program_authority,
    )]
    pub mint_authority: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: dex one mint
    #[account(
        mut,
        mint::token_program = token_program_payer,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// Program to create mint account and mint tokens
    pub token_program: Program<'info, Token>,
    /// Spl token program or token program 2022
    pub token_program_payer: Interface<'info, TokenInterface>,
    /// Spl token program or token program 2022
    pub token_program_authority: Interface<'info, TokenInterface>,
    /// Program to create an ATA for receiving position NFT
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}

pub fn cpi_initialize_dex_with_faucet(ctx: Context<CpiInitializeDexWithFaucet>) -> Result<()> {
    let seeds = [
        LAUNCHER_AUTHORITY_SEED.as_bytes(),
        &[ctx.accounts.authority_manager.authority_bump],
    ];
    let signer_seeds = &[seeds.as_slice()];

    let token_utils = TokenUtils {
        mint: ctx.accounts.mint_authority.to_account_info(),
        decimals: ctx.accounts.mint_authority.decimals,
        token_program: ctx.accounts.token_program_authority.to_account_info(),
    };

    token_utils.mint_to(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.team_vault.to_account_info(),
        ctx.accounts.config.team_tokens,
        signer_seeds,
    )?;

    token_utils.mint_to(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.faucet_vault.to_account_info(),
        ctx.accounts.config.faucet_tokens,
        signer_seeds,
    )?;

    let rest_token_amount =
        MAX_TOKEN_SUPPLY - ctx.accounts.config.team_tokens - ctx.accounts.config.faucet_tokens;
    token_utils.mint_to(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.payer_vault_authority.to_account_info(),
        rest_token_amount,
        signer_seeds,
    )?;

    msg!(
        "mint_authority > mint {}",
        ctx.accounts.mint_authority.key() > ctx.accounts.mint.key()
    );

    let vault_for_reserve_bound;
    let (
        payer_vault_zero,
        payer_vault_one,
        mint_zero,
        mint_one,
        token_program_zero,
        token_program_one,
        dex_vault_zero,
        dex_vault_one,
    ) = if ctx.accounts.mint_authority.key() > ctx.accounts.mint.key() {
        vault_for_reserve_bound = true;
        (
            //
            ctx.accounts.payer_vault.to_account_info(),
            ctx.accounts.payer_vault_authority.to_account_info(),
            //
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
            //
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program_authority.to_account_info(),
            //
            ctx.accounts.dex_vault.to_account_info(),
            ctx.accounts.dex_vault_authority.to_account_info(),
        )
    } else {
        vault_for_reserve_bound = false;
        (
            ctx.accounts.payer_vault_authority.to_account_info(),
            ctx.accounts.payer_vault.to_account_info(),
            ctx.accounts.mint_authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.token_program_authority.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.dex_vault_authority.to_account_info(),
            ctx.accounts.dex_vault.to_account_info(),
        )
    };

    let cpi_accounts = dex::cpi::accounts::InitializeDex {
        cpi_authority: ctx.accounts.authority.to_account_info(),
        payer: ctx.accounts.payer.to_account_info(),
        config: ctx.accounts.dex_config.to_account_info(),
        authority_manager: ctx.accounts.dex_authority_manager.to_account_info(),
        authority: ctx.accounts.dex_authority.to_account_info(),
        dex_state: ctx.accounts.dex_state.to_account_info(),
        mint_zero,
        mint_one,
        payer_vault_zero,
        payer_vault_one,
        dex_vault_zero,
        dex_vault_one,
        token_program_zero,
        token_program_one,
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.dex_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    dex::cpi::initialize_dex(
        cpi_context,
        rest_token_amount,
        vault_for_reserve_bound,
        false,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct CpiInitializeDexWithFaucet<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = payer,
        associated_token::token_program = token_program_payer,
    )]
    pub payer_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: payer zero mint account
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint_authority,
        associated_token::authority = payer,
        associated_token::token_program = token_program_authority,
    )]
    pub payer_vault_authority: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: faucet vault authority
    #[account(
        mut,
        seeds = [
            LAUNCHER_AUTHORITY_SEED.as_bytes(),
        ],
        bump = authority_manager.authority_bump,
    )]
    pub authority: AccountInfo<'info>,
    #[account(
        seeds = [
            LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump = authority_manager.bump,
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    #[account(
        seeds = [LAUNCHER_CONFIG_SEED.as_bytes(),],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ConfigState>>,
    /// CHECK: dex program
    #[account(
        address = authority_manager.faucet_authority
    )]
    pub faucet_authority: UncheckedAccount<'info>,
    /// CHECK: dex program
    pub dex_program: UncheckedAccount<'info>,
    /// CHECK: dex config
    pub dex_config: Box<Account<'info, dex::states::ConfigState>>,
    /// CHECK: dex authority manager
    pub dex_authority_manager: UncheckedAccount<'info>,
    /// CHECK: dex authority
    pub dex_authority: UncheckedAccount<'info>,
    /// CHECK: dex_state
    #[account(mut)]
    pub dex_state: UncheckedAccount<'info>,
    /// CHECK: zero mint account vault for the dex
    #[account(mut)]
    pub dex_vault_authority: UncheckedAccount<'info>,
    /// CHECK: one mint account vault for the dex
    #[account(mut)]
    pub dex_vault: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = mint_authority,
        token::authority = faucet_authority,
        token::token_program = token_program_authority,
    )]
    pub faucet_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        token::mint = mint_authority,
        token::authority = authority,
        token::token_program = token_program_authority,
        payer = payer,
        seeds = [LAUNCHER_TEAM_VAULT_SEED.as_bytes(), mint_authority.key().as_ref()],
        bump,
    )]
    pub team_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: dex zero mint
    #[account(
        mut,
        mint::token_program = token_program_authority,
    )]
    pub mint_authority: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: dex one mint
    #[account(
        mut,
        mint::token_program = token_program_payer,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// Program to create mint account and mint tokens
    pub token_program: Program<'info, Token>,
    /// Spl token program or token program 2022
    pub token_program_payer: Interface<'info, TokenInterface>,
    /// Spl token program or token program 2022
    pub token_program_authority: Interface<'info, TokenInterface>,
    /// Program to create an ATA for receiving position NFT
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}
