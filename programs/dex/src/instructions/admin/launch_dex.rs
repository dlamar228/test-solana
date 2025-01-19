use crate::states::*;
use crate::utils::token::*;
use crate::{curve::Fees, error::ErrorCode};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::Token,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use solana_program::{
    program::{invoke, invoke_signed},
    program_pack::Pack,
    system_instruction,
};

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

pub fn launch_dex(ctx: Context<Launch>, shared_lamports: u64) -> Result<()> {
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
        dex_state.launch_fee_rate,
        &ctx.accounts.token_0_mint.to_account_info(),
    )?;
    let (taxed_amount_1, launch_fees_1, transfer_fee_1) = get_taxed_amount_before_launch(
        ctx.accounts.creator_token_1.amount,
        dex_state.swap_fees_token_1,
        dex_state.launch_fee_rate,
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
            ctx.accounts.admin.key,
            &ctx.accounts.dex_authority.key(),
            shared_lamports,
        ),
        &[
            ctx.accounts.admin.to_account_info(),
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
    let seeds = [DEX_AUTH_SEED.as_bytes(), &[dex_state.auth_bump]];
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
            ctx.accounts.admin.key,
            ctx.accounts.dex_authority.lamports(),
        ),
        &[
            ctx.accounts.dex_authority.to_account_info(),
            ctx.accounts.admin.to_account_info(),
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
pub struct Launch<'info> {
    /// Address paying to create the pool. Can be anyone
    #[account(mut, constraint = admin.key() == dex_config.admin || admin.key() == protocol.admin @ ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,
    /// CHECK: dex vault authority
    #[account(
        mut,
        seeds = [
            DEX_AUTH_SEED.as_bytes(),
        ],
        bump,
       
    )]
    pub dex_authority: UncheckedAccount<'info>,
    pub protocol: Box<Account<'info, ProtocolState>>,
    /// The program account of the dex in which the swap will be performed
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
    #[account(address = dex_state.load()?.config)]
    pub dex_config: Box<Account<'info, ConfigState>>,
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
