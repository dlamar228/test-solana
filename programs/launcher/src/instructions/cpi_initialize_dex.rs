use crate::errors::ErrorCode;
use crate::states::*;
use crate::utils::TokenUtils;

use super::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

pub fn cpi_initialize_dex<'info>(
    ctx: &Context<'_, '_, '_, 'info, CpiInitializeDex<'info>>,
) -> Result<()> {
    if ctx.accounts.mint_authority.supply != 0 {
        return err!(ErrorCode::NotAllowed);
    }

    DexInitializer::from_ctx(ctx).initialize()
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

pub fn cpi_initialize_dex_with_faucet<'info>(
    ctx: &Context<'_, '_, '_, 'info, CpiInitializeDexWithFaucet<'info>>,
) -> Result<()> {
    if ctx.accounts.mint_authority.supply != 0 {
        return err!(ErrorCode::NotAllowed);
    }

    DexInitializer::from_ctx_with_faucet(ctx).initialize()
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

struct DexInitializer<'info> {
    pub payer: AccountInfo<'info>,
    pub payer_vault: AccountInfo<'info>,
    pub payer_vault_authority: AccountInfo<'info>,
    pub authority: AccountInfo<'info>,
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    pub config: Box<Account<'info, ConfigState>>,
    pub faucet_vault: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
    pub dex_program: AccountInfo<'info>,
    pub dex_config: AccountInfo<'info>,
    pub dex_authority_manager: AccountInfo<'info>,
    pub dex_authority: AccountInfo<'info>,
    pub dex_state: AccountInfo<'info>,
    pub dex_vault_authority: AccountInfo<'info>,
    pub dex_vault: AccountInfo<'info>,
    pub team_vault: AccountInfo<'info>,
    pub mint_authority: Box<InterfaceAccount<'info, Mint>>,
    pub mint: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    pub token_program_payer: AccountInfo<'info>,
    pub token_program_authority: AccountInfo<'info>,
    pub associated_token_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub rent: AccountInfo<'info>,
}

impl<'info> DexInitializer<'info> {
    pub fn from_ctx_with_faucet(
        ctx: &Context<'_, '_, '_, 'info, CpiInitializeDexWithFaucet<'info>>,
    ) -> Self {
        Self {
            payer: ctx.accounts.payer.to_account_info(),
            payer_vault: ctx.accounts.payer_vault.to_account_info(),
            payer_vault_authority: ctx.accounts.payer_vault_authority.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            authority_manager: ctx.accounts.authority_manager.clone(),
            config: ctx.accounts.config.clone(),
            faucet_vault: Some(ctx.accounts.faucet_vault.clone()),
            dex_program: ctx.accounts.dex_program.to_account_info(),
            dex_config: ctx.accounts.dex_config.to_account_info(),
            dex_authority_manager: ctx.accounts.dex_authority_manager.to_account_info(),
            dex_authority: ctx.accounts.dex_authority.to_account_info(),
            dex_state: ctx.accounts.dex_state.to_account_info(),
            dex_vault_authority: ctx.accounts.dex_vault_authority.to_account_info(),
            dex_vault: ctx.accounts.dex_vault.to_account_info(),
            team_vault: ctx.accounts.team_vault.to_account_info(),
            mint_authority: ctx.accounts.mint_authority.clone(),
            mint: ctx.accounts.mint.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_program_payer: ctx.accounts.token_program_payer.to_account_info(),
            token_program_authority: ctx.accounts.token_program_authority.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        }
    }

    pub fn from_ctx(ctx: &Context<'_, '_, '_, 'info, CpiInitializeDex<'info>>) -> Self {
        Self {
            payer: ctx.accounts.payer.to_account_info(),
            payer_vault: ctx.accounts.payer_vault.to_account_info(),
            payer_vault_authority: ctx.accounts.payer_vault_authority.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            authority_manager: ctx.accounts.authority_manager.clone(),
            config: ctx.accounts.config.clone(),
            faucet_vault: None,
            dex_program: ctx.accounts.dex_program.to_account_info(),
            dex_config: ctx.accounts.dex_config.to_account_info(),
            dex_authority_manager: ctx.accounts.dex_authority_manager.to_account_info(),
            dex_authority: ctx.accounts.dex_authority.to_account_info(),
            dex_state: ctx.accounts.dex_state.to_account_info(),
            dex_vault_authority: ctx.accounts.dex_vault_authority.to_account_info(),
            dex_vault: ctx.accounts.dex_vault.to_account_info(),
            team_vault: ctx.accounts.team_vault.to_account_info(),
            mint_authority: ctx.accounts.mint_authority.clone(),
            mint: ctx.accounts.mint.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
            token_program_payer: ctx.accounts.token_program_payer.to_account_info(),
            token_program_authority: ctx.accounts.token_program_authority.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        }
    }

    fn spread_tokens(&self, signer_seeds: &[&[&[u8]]]) -> Result<u64> {
        let mut rest_token_amount = MAX_TOKEN_SUPPLY;

        let token_utils = TokenUtils {
            mint: self.mint_authority.to_account_info(),
            decimals: self.mint_authority.decimals,
            token_program: self.token_program_authority.clone(),
        };

        if let Some(faucet_vault) = &self.faucet_vault {
            token_utils.mint_to(
                self.authority.clone(),
                faucet_vault.to_account_info(),
                self.config.faucet_tokens,
                signer_seeds,
            )?;

            rest_token_amount -= self.config.faucet_tokens;
        }

        token_utils.mint_to(
            self.authority.clone(),
            self.team_vault.clone(),
            self.config.team_tokens,
            signer_seeds,
        )?;

        rest_token_amount -= self.config.team_tokens;

        token_utils.mint_to(
            self.authority.clone(),
            self.payer_vault_authority.clone(),
            rest_token_amount,
            signer_seeds,
        )?;

        Ok(rest_token_amount)
    }

    fn sort_mints(&self) -> SortedMints<'info> {
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
        ) = if self.mint_authority.key() > self.mint.key() {
            vault_for_reserve_bound = false;
            (
                self.payer_vault.to_account_info(),
                self.payer_vault_authority.to_account_info(),
                self.mint.to_account_info(),
                self.mint_authority.to_account_info(),
                self.token_program_payer.to_account_info(),
                self.token_program_authority.to_account_info(),
                self.dex_vault.to_account_info(),
                self.dex_vault_authority.to_account_info(),
            )
        } else {
            vault_for_reserve_bound = true;
            (
                self.payer_vault_authority.to_account_info(),
                self.payer_vault.to_account_info(),
                self.mint_authority.to_account_info(),
                self.mint.to_account_info(),
                self.token_program_authority.to_account_info(),
                self.token_program_payer.to_account_info(),
                self.dex_vault_authority.to_account_info(),
                self.dex_vault.to_account_info(),
            )
        };

        SortedMints {
            vault_for_reserve_bound,
            payer_vault_zero,
            payer_vault_one,
            mint_zero,
            mint_one,
            token_program_zero,
            token_program_one,
            dex_vault_zero,
            dex_vault_one,
        }
    }

    fn cpi_initialize(
        &self,
        sorted_mints: SortedMints<'info>,
        rest_token_amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        let mint_zero_id = sorted_mints.mint_zero.key();
        let mint_one_id = sorted_mints.mint_one.key();

        let cpi_accounts = dex::cpi::accounts::InitializeDex {
            cpi_authority: self.authority.clone(),
            payer: self.payer.clone(),
            config: self.dex_config.clone(),
            authority_manager: self.dex_authority_manager.clone(),
            authority: self.dex_authority.clone(),
            dex_state: self.dex_state.clone(),
            mint_zero: sorted_mints.mint_zero,
            mint_one: sorted_mints.mint_one,
            payer_vault_zero: sorted_mints.payer_vault_zero,
            payer_vault_one: sorted_mints.payer_vault_one,
            dex_vault_zero: sorted_mints.dex_vault_zero,
            dex_vault_one: sorted_mints.dex_vault_one,
            token_program_zero: sorted_mints.token_program_zero,
            token_program_one: sorted_mints.token_program_one,
            associated_token_program: self.associated_token_program.clone(),
            system_program: self.system_program.clone(),
            token_program: self.token_program.clone(),
            rent: self.rent.clone(),
        };

        let cpi_context =
            CpiContext::new_with_signer(self.dex_program.clone(), cpi_accounts, signer_seeds);

        dex::cpi::initialize_dex(
            cpi_context,
            rest_token_amount,
            sorted_mints.vault_for_reserve_bound,
        )?;

        if self.faucet_vault.is_some() {
            emit!(InitializeDexWithFaucetEvent {
                dex_id: self.dex_state.key(),
                payer_id: self.payer.key(),
                mint_zero_id,
                mint_one_id,
                team_tokens_amount: self.config.team_tokens,
                faucet_tokens_amount: self.config.faucet_tokens,
            });
        } else {
            emit!(InitializeDexEvent {
                dex_id: self.dex_state.key(),
                payer_id: self.payer.key(),
                mint_zero_id,
                mint_one_id,
                team_tokens_amount: self.config.team_tokens,
            });
        }

        Ok(())
    }

    pub fn initialize(&self) -> Result<()> {
        let seeds = [
            LAUNCHER_AUTHORITY_SEED.as_bytes(),
            &[self.authority_manager.authority_bump],
        ];
        let signer_seeds = &[seeds.as_slice()];

        let rest_token_amount = self.spread_tokens(signer_seeds)?;

        let sorted_mints = self.sort_mints();

        self.cpi_initialize(sorted_mints, rest_token_amount, signer_seeds)?;

        Ok(())
    }
}

struct SortedMints<'info> {
    pub vault_for_reserve_bound: bool,
    pub payer_vault_zero: AccountInfo<'info>,
    pub payer_vault_one: AccountInfo<'info>,
    pub mint_zero: AccountInfo<'info>,
    pub mint_one: AccountInfo<'info>,
    pub token_program_zero: AccountInfo<'info>,
    pub token_program_one: AccountInfo<'info>,
    pub dex_vault_zero: AccountInfo<'info>,
    pub dex_vault_one: AccountInfo<'info>,
}
