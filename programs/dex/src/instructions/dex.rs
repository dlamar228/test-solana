use crate::curve::CurveCalculator;
use crate::curve::Fees;
use crate::error::ErrorCode;
use crate::states::*;
use crate::utils::*;

use anchor_lang::{accounts::interface_account::InterfaceAccount, prelude::*, system_program};

use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_2022::spl_token_2022,
    token_interface::{Mint, Token2022, TokenAccount, TokenInterface},
};

use solana_program::{
    program::{invoke, invoke_signed},
    program_pack::Pack,
    system_instruction,
};

use std::ops::Deref;

mod raydium {
    pub use raydium_cp_swap::{
        create_pool_fee_reveiver::id as pool_fee_reveiver_id,
        program::RaydiumCpSwap,
        states::{
            oracle::OBSERVATION_SEED, AmmConfig, POOL_LP_MINT_SEED, POOL_SEED, POOL_VAULT_SEED,
        },
        AUTH_SEED,
    };
}

pub fn initialize_dex(
    ctx: Context<InitializeDex>,
    init_amount: u64,
    vault_for_reserve_bound: bool,
    reserve_bound_ge: bool,
) -> Result<()> {
    if !(is_supported_mint(&ctx.accounts.mint_zero).unwrap()
        && is_supported_mint(&ctx.accounts.mint_one).unwrap())
    {
        return err!(ErrorCode::NotSupportMint);
    }

    // due to stack/heap limitations, we have to create redundant new accounts ourselves.
    create_token_account(
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.dex_vault_zero.to_account_info(),
        &ctx.accounts.mint_zero.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.token_program_zero.to_account_info(),
        &[&[
            DEX_VAULT_SEED.as_bytes(),
            ctx.accounts.dex_state.key().as_ref(),
            ctx.accounts.mint_zero.key().as_ref(),
            &[ctx.bumps.dex_vault_zero][..],
        ][..]],
    )?;

    create_token_account(
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.dex_vault_one.to_account_info(),
        &ctx.accounts.mint_one.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        &ctx.accounts.token_program_one.to_account_info(),
        &[&[
            DEX_VAULT_SEED.as_bytes(),
            ctx.accounts.dex_state.key().as_ref(),
            ctx.accounts.mint_one.key().as_ref(),
            &[ctx.bumps.dex_vault_one][..],
        ][..]],
    )?;

    let dex_id = ctx.accounts.dex_state.key();

    let dex_state_loader = create_dex(
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.dex_state.to_account_info(),
        &ctx.accounts.mint_zero.to_account_info(),
        &ctx.accounts.mint_one.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
    )?;
    let dex_state = &mut dex_state_loader.load_init()?;

    let (init_amount_zero, init_amount_one) = if vault_for_reserve_bound {
        (ctx.accounts.config.initial_reserve, init_amount)
    } else {
        (init_amount, ctx.accounts.config.initial_reserve)
    };

    transfer_from_user_to_dex_vault(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.payer_vault_zero.to_account_info(),
        ctx.accounts.dex_vault_zero.to_account_info(),
        ctx.accounts.mint_zero.to_account_info(),
        ctx.accounts.token_program_zero.to_account_info(),
        init_amount_zero,
        ctx.accounts.mint_zero.decimals,
    )?;

    transfer_from_user_to_dex_vault(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.payer_vault_one.to_account_info(),
        ctx.accounts.dex_vault_one.to_account_info(),
        ctx.accounts.mint_one.to_account_info(),
        ctx.accounts.token_program_one.to_account_info(),
        init_amount_one,
        ctx.accounts.mint_one.decimals,
    )?;

    let token_0_vault =
        spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Account>::unpack(
            ctx.accounts
                .dex_vault_zero
                .to_account_info()
                .try_borrow_data()?
                .deref(),
        )?
        .base;
    let token_1_vault =
        spl_token_2022::extension::StateWithExtensions::<spl_token_2022::state::Account>::unpack(
            ctx.accounts
                .dex_vault_one
                .to_account_info()
                .try_borrow_data()?
                .deref(),
        )?
        .base;

    CurveCalculator::validate_supply(token_0_vault.amount, token_1_vault.amount)?;

    let vault_reserve_bound = ctx.accounts.config.vault_reserve_bound;

    dex_state.initialize(
        ctx.accounts.payer.key(),
        ctx.accounts.dex_vault_zero.key(),
        ctx.accounts.dex_vault_one.key(),
        &ctx.accounts.mint_zero,
        &ctx.accounts.mint_one,
        vault_for_reserve_bound,
        reserve_bound_ge,
        vault_reserve_bound,
    );

    emit!(InitializeDexEvent {
        dex_id,
        payer_id: ctx.accounts.payer.key(),
        mint_zero: ctx.accounts.mint_zero.key(),
        mint_one: ctx.accounts.mint_one.key(),
        token_zero_amount: token_0_vault.amount,
        token_one_amount: token_1_vault.amount,
        reserve_bound: vault_reserve_bound,
        vault_for_reserve_bound,
    });

    Ok(())
}

pub fn create_dex<'info>(
    payer: &AccountInfo<'info>,
    dex_account_info: &AccountInfo<'info>,
    token_0_mint: &AccountInfo<'info>,
    token_1_mint: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<AccountLoad<'info, DexState>> {
    if dex_account_info.owner != &system_program::ID || dex_account_info.lamports() != 0 {
        return err!(ErrorCode::NotApproved);
    }

    let (expect_pda_address, bump) = Pubkey::find_program_address(
        &[
            DEX_STATE_SEED.as_bytes(),
            token_0_mint.key().as_ref(),
            token_1_mint.key().as_ref(),
        ],
        &crate::id(),
    );

    if dex_account_info.key() != expect_pda_address {
        require_eq!(dex_account_info.is_signer, true);
    }

    let cpi_accounts = anchor_lang::system_program::CreateAccount {
        from: payer.clone(),
        to: dex_account_info.clone(),
    };
    let cpi_context = CpiContext::new(system_program.to_account_info(), cpi_accounts);
    anchor_lang::system_program::create_account(
        cpi_context.with_signer(&[&[
            DEX_STATE_SEED.as_bytes(),
            token_0_mint.key().as_ref(),
            token_1_mint.key().as_ref(),
            &[bump],
        ][..]]),
        Rent::get()?.minimum_balance(DexState::LEN),
        DexState::LEN as u64,
        &crate::id(),
    )?;

    AccountLoad::<DexState>::try_from_unchecked(&crate::id(), dex_account_info)
}

#[derive(Accounts)]
pub struct InitializeDex<'info> {
    #[account(
        address = authority_manager.cpi_authority @ ErrorCode::InvalidCpiAuthority,
    )]
    pub cpi_authority: Signer<'info>,
    /// Address paying to create the dex
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Which config the dex belongs to.
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
        bump= authority_manager.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// CHECK: Initialize an account to store the dex state
    #[account(mut)]
    pub dex_state: UncheckedAccount<'info>,
    /// Token_0 mint, the key must smaller then token_1 mint.
    #[account(
        constraint = mint_zero.key() < mint_one.key(),
        mint::token_program = token_program_zero,
    )]
    pub mint_zero: Box<InterfaceAccount<'info, Mint>>,
    /// Token_1 mint, the key must grater then token_0 mint.
    #[account(
        mint::token_program = token_program_one,
    )]
    pub mint_one: Box<InterfaceAccount<'info, Mint>>,
    /// payer token0 account
    #[account(
        mut,
        token::mint = mint_zero,
        token::authority = payer,
    )]
    pub payer_vault_zero: Box<InterfaceAccount<'info, TokenAccount>>,
    /// creator token1 account
    #[account(
        mut,
        token::mint = mint_one,
        token::authority = payer,
    )]
    pub payer_vault_one: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Token_0 vault for the dex, create by contract
    #[account(
        mut,
        seeds = [
            DEX_VAULT_SEED.as_bytes(),
            dex_state.key().as_ref(),
            mint_zero.key().as_ref()
        ],
        bump,
    )]
    pub dex_vault_zero: UncheckedAccount<'info>,
    /// CHECK: Token_1 vault for the dex, create by contract
    #[account(
        mut,
        seeds = [
            DEX_VAULT_SEED.as_bytes(),
            dex_state.key().as_ref(),
            mint_one.key().as_ref()
        ],
        bump,
    )]
    pub dex_vault_one: UncheckedAccount<'info>,
    /// Program to create mint account and mint tokens
    pub token_program: Program<'info, Token>,
    /// Spl token program or token program 2022
    pub token_program_zero: Interface<'info, TokenInterface>,
    /// Spl token program or token program 2022
    pub token_program_one: Interface<'info, TokenInterface>,
    /// Program to create an ATA for receiving position NFT
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}

pub fn withdraw_dex_fee(ctx: Context<WithdrawDexFee>) -> Result<()> {
    let dex_id = ctx.accounts.dex_state.key();
    let mut dex_state = ctx.accounts.dex_state.load_mut()?;
    let mut amount_0 = dex_state.swap_fees_token_0;
    let mut amount_1 = dex_state.swap_fees_token_1;

    dex_state.swap_fees_token_0 = dex_state
        .swap_fees_token_0
        .checked_sub(amount_0)
        .ok_or(crate::error::ErrorCode::Underflow)?;
    dex_state.swap_fees_token_1 = dex_state
        .swap_fees_token_1
        .checked_sub(amount_1)
        .ok_or(crate::error::ErrorCode::Underflow)?;

    if dex_state.is_launched {
        amount_0 = amount_0
            .checked_add(dex_state.launch_fees_token_0)
            .ok_or(crate::error::ErrorCode::Overflow)?;
        amount_1 = amount_1
            .checked_add(dex_state.launch_fees_token_1)
            .ok_or(crate::error::ErrorCode::Overflow)?;

        dex_state.launch_fees_token_0 = 0;
        dex_state.launch_fees_token_1 = 0;
    }

    // dex authority pda signer seeds
    let seeds = [
        DEX_AUTHORITY_SEED.as_bytes(),
        &[ctx.accounts.authority_manager.authority_bump],
    ];
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

    emit!(WithdrawDexFeeEvent {
        admin_id: ctx.accounts.admin.key(),
        dex_id,
        token_zero_amount: amount_0,
        token_one_amount: amount_1
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawDexFee<'info> {
    /// Only admin can collect fee now
    #[account(address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    /// CHECK: dex vault mint authority
    #[account(
        seeds = [
            DEX_AUTHORITY_SEED.as_bytes(),
        ],
        bump = authority_manager.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// Dex state stores accumulated protocol fee amount
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
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

pub fn launch_dex(ctx: Context<LaunchDex>, shared_lamports: u64) -> Result<()> {
    let dex_id = ctx.accounts.dex_state.key();
    let raydium_id = ctx.accounts.pool_state.key();
    let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    if !dex_state.is_ready_to_launch {
        return err!(ErrorCode::DexNotReadyToLaunch);
    }

    if dex_state.is_launched {
        return err!(ErrorCode::DexLaunched);
    }

    let (taxed_amount_0, launch_fees_0, transfer_fee_0) = get_taxed_amount_before_launch(
        ctx.accounts.creator_token_0.amount,
        dex_state.swap_fees_token_0,
        ctx.accounts.dex_config.launch_fee_rate,
        &ctx.accounts.token_0_mint.to_account_info(),
    )?;
    let (taxed_amount_1, launch_fees_1, transfer_fee_1) = get_taxed_amount_before_launch(
        ctx.accounts.creator_token_1.amount,
        dex_state.swap_fees_token_1,
        ctx.accounts.dex_config.launch_fee_rate,
        &ctx.accounts.token_1_mint.to_account_info(),
    )?;

    dex_state.launch_fees_token_0 = launch_fees_0;
    dex_state.launch_fees_token_1 = launch_fees_1;

    #[cfg(feature = "enable-log")]
    msg!(
        "launch_dex taxed_amount_0:{},launch_fees_0:{},transfer_fee_0:{},taxed_amount_1:{},launch_fees_1:{},transfer_fee_1:{},raydium_create_pool_fee:{}",
        taxed_amount_0,
        launch_fees_0,
        transfer_fee_0,
        taxed_amount_1,
        launch_fees_1,
        transfer_fee_1,
        ctx.accounts.amm_config.create_pool_fee,
    );

    invoke(
        &system_instruction::transfer(
            ctx.accounts.payer.key,
            &ctx.accounts.dex_authority.key(),
            shared_lamports,
        ),
        &[
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.dex_authority.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let cpi_accounts = raydium_cp_swap::cpi::accounts::Initialize {
        creator: ctx.accounts.dex_authority.to_account_info(),
        amm_config: ctx.accounts.amm_config.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        pool_state: ctx.accounts.pool_state.to_account_info(),
        token_0_mint: ctx.accounts.token_0_mint.to_account_info(),
        token_1_mint: ctx.accounts.token_1_mint.to_account_info(),
        lp_mint: ctx.accounts.lp_mint.to_account_info(),
        creator_token_0: ctx.accounts.creator_token_0.to_account_info(),
        creator_token_1: ctx.accounts.creator_token_1.to_account_info(),
        creator_lp_token: ctx.accounts.creator_lp_token.to_account_info(),
        token_0_vault: ctx.accounts.token_0_vault.to_account_info(),
        token_1_vault: ctx.accounts.token_1_vault.to_account_info(),
        create_pool_fee: ctx.accounts.create_pool_fee.to_account_info(),
        observation_state: ctx.accounts.observation_state.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        token_0_program: ctx.accounts.token_0_program.to_account_info(),
        token_1_program: ctx.accounts.token_1_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };

    // dex authority pda signer seeds
    let seeds = [
        DEX_AUTHORITY_SEED.as_bytes(),
        &[ctx.accounts.dex_authority_manager.authority_bump],
    ];
    let signer_seeds = &[seeds.as_slice()];

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.cp_swap_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );

    raydium_cp_swap::cpi::initialize(cpi_context, taxed_amount_0, taxed_amount_1, 0)?;

    invoke_signed(
        &system_instruction::transfer(
            &ctx.accounts.dex_authority.key(),
            ctx.accounts.payer.key,
            ctx.accounts.dex_authority.lamports(),
        ),
        &[
            ctx.accounts.dex_authority.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    let lp_amount_to_burn =
        spl_token::state::Account::unpack(&ctx.accounts.creator_lp_token.data.borrow())?.amount;
    token_burn(
        ctx.accounts.dex_authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.lp_mint.to_account_info(),
        ctx.accounts.creator_lp_token.to_account_info(),
        lp_amount_to_burn,
        signer_seeds,
    )?;

    emit!(DexLaunchedEvent {
        dex_id,
        raydium_id,
        admin_id: ctx.accounts.payer.key(),
        amount_0: taxed_amount_0,
        amount_1: taxed_amount_1,
        launch_fees_0,
        launch_fees_1,
        transfer_fee_0,
        transfer_fee_1,
        lp_burned: lp_amount_to_burn,
    });

    dex_state.is_launched = true;

    Ok(())
}

fn get_taxed_amount_before_launch(
    amount: u64,
    swap_fees: u64,
    launch_fee_rate: u64,
    mint: &AccountInfo,
) -> Result<(u64, u64, u64)> {
    let clean = amount.checked_sub(swap_fees).ok_or(ErrorCode::Underflow)?;
    let launch_tax = Fees::protocol_fee(clean as u128, launch_fee_rate).unwrap();
    let casted_launch_tax = u64::try_from(launch_tax).map_err(|_| ErrorCode::InvalidU64Cast)?;

    let transfer_fee = get_transfer_fee(mint, casted_launch_tax)?;

    Ok((
        clean
            .checked_sub(casted_launch_tax)
            .ok_or(ErrorCode::Underflow)?
            .checked_sub(transfer_fee)
            .ok_or(ErrorCode::Underflow)?,
        casted_launch_tax,
        transfer_fee,
    ))
}

#[derive(Accounts)]
pub struct LaunchDex<'info> {
    /// Address paying to create the pool. Can be anyone
    #[account(mut, address = dex_authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    /// CHECK: dex vault authority
    #[account(
        mut,
        seeds = [DEX_AUTHORITY_SEED.as_bytes(),],
        bump = dex_authority_manager.authority_bump,
    )]
    pub dex_authority: UncheckedAccount<'info>,
    #[account(
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = dex_authority_manager.bump
    )]
    pub dex_authority_manager: Box<Account<'info, AuthorityManager>>,
    #[account(
        seeds = [DEX_CONFIG_SEED.as_bytes()],
        bump = dex_config.bump
    )]
    pub dex_config: Box<Account<'info, ConfigState>>,
    /// The program account of the dex in which the swap will be performed
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
    pub cp_swap_program: Program<'info, raydium::RaydiumCpSwap>,
    /// Which config the pool belongs to.
    pub amm_config: Box<Account<'info, raydium::AmmConfig>>,
    /// CHECK: pool vault and lp mint authority
    #[account(
        seeds = [
            raydium::AUTH_SEED.as_bytes(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// CHECK: Initialize an account to store the pool state, init by cp-swap
    #[account(
        mut,
        seeds = [
            raydium::POOL_SEED.as_bytes(),
            amm_config.key().as_ref(),
            token_0_mint.key().as_ref(),
            token_1_mint.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub pool_state: UncheckedAccount<'info>,
    /// Token_0 mint, the key must smaller then token_1 mint.
    #[account(
        constraint = token_0_mint.key() < token_1_mint.key(),
        mint::token_program = token_0_program,
    )]
    pub token_0_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Token_1 mint, the key must grater then token_0 mint.
    #[account(
        mint::token_program = token_1_program,
    )]
    pub token_1_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: pool lp mint, init by cp-swap
    #[account(
        mut,
        seeds = [
            raydium::POOL_LP_MINT_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub lp_mint: UncheckedAccount<'info>,
    /// dex vault0 account
    #[account(
        mut,
        token::mint = token_0_mint,
        token::authority = dex_authority,
    )]
    pub creator_token_0: Box<InterfaceAccount<'info, TokenAccount>>,
    /// dex vault0 account
    #[account(
        mut,
        token::mint = token_1_mint,
        token::authority = dex_authority,
    )]
    pub creator_token_1: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: dex lp ATA token account, init by cp-swap
    #[account(mut)]
    pub creator_lp_token: UncheckedAccount<'info>,
    /// CHECK: Token_0 vault for the pool, init by cp-swap
    #[account(
        mut,
        seeds = [
            raydium::POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_0_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub token_0_vault: UncheckedAccount<'info>,
    /// CHECK: Token_1 vault for the pool, init by cp-swap
    #[account(
        mut,
        seeds = [
            raydium::POOL_VAULT_SEED.as_bytes(),
            pool_state.key().as_ref(),
            token_1_mint.key().as_ref()
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub token_1_vault: UncheckedAccount<'info>,
    /// create pool fee account
    #[account(
        mut,
        address = raydium::pool_fee_reveiver_id(),
    )]
    pub create_pool_fee: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: an account to store oracle observations, init by cp-swap
    #[account(
        mut,
        seeds = [
            raydium::OBSERVATION_SEED.as_bytes(),
            pool_state.key().as_ref(),
        ],
        seeds::program = cp_swap_program,
        bump,
    )]
    pub observation_state: UncheckedAccount<'info>,
    /// Program to create mint account and mint tokens
    pub token_program: Program<'info, Token>,
    /// Spl token program or token program 2022
    pub token_0_program: Interface<'info, TokenInterface>,
    /// Spl token program or token program 2022
    pub token_1_program: Interface<'info, TokenInterface>,
    /// Program to create an ATA for receiving position NFT
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}
