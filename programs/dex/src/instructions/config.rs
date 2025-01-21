use crate::curve::MAX_FEE_RATE_VALUE;
use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

pub fn initialize_config(ctx: Context<InitializeConfigState>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.bump = ctx.bumps.config;
    config.swap_fee_rate = 10_000;
    config.launch_fee_rate = 10_000;
    config.initial_reserve = 2 * 10u64.pow(9);
    config.vault_reserve_bound = 205_000_000 * 10u64.pow(9);

    // emit!(InitializeConfigEvent {
    //     config_id,
    //     index,
    //     admin: config.admin,
    // });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfigState<'info> {
    #[account(mut, address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [
            DEX_AUTHORITY_MANAGER_SEED.as_bytes()
        ],
        bump = authority_manager.bump,
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
    #[account(
        init,
        seeds = [
            DEX_CONFIG_SEED.as_bytes()
        ],
        bump,
        payer = payer,
        space = ConfigState::LEN
    )]
    pub config: Account<'info, ConfigState>,
    pub system_program: Program<'info, System>,
}

pub fn update_swap_fee_rate(ctx: Context<UpdateConfigState>, swap_fee_rate: u64) -> Result<()> {
    assert!(swap_fee_rate <= MAX_FEE_RATE_VALUE);
    // let dex_id = ctx.accounts.dex_state.key();
    // let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    // let old = dex_state.swap_fee_rate;
    // #[cfg(feature = "enable-log")]
    // msg!("update_swap_fee_rate, old:{}, new:{}", old, swap_fee_rate,);

    // emit!(UpdateDexSwapFeeRateEvent {
    //     dex_id,
    //     old,
    //     new: swap_fee_rate,
    // });
    let config = &mut ctx.accounts.config;
    config.swap_fee_rate = swap_fee_rate;

    Ok(())
}

pub fn update_launch_fee_rate(ctx: Context<UpdateConfigState>, launch_fee_rate: u64) -> Result<()> {
    assert!(launch_fee_rate <= MAX_FEE_RATE_VALUE);
    // let dex_id = ctx.accounts.dex_state.key();
    // let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    // let old = dex_state.launch_fee_rate;
    // #[cfg(feature = "enable-log")]
    // msg!(
    //     "update_launch_fee_rate, old:{}, new:{}",
    //     old,
    //     launch_fee_rate,
    // );

    // emit!(UpdateDexLaunchFeeRateEvent {
    //     dex_id,
    //     old,
    //     new: launch_fee_rate,
    // });

    // dex_state.launch_fee_rate = launch_fee_rate;

    let config = &mut ctx.accounts.config;
    config.launch_fee_rate = launch_fee_rate;

    Ok(())
}

pub fn update_vault_reserve_bound(
    ctx: Context<UpdateConfigState>,
    vault_reserve_bound: u64,
) -> Result<()> {
    // let dex_id = ctx.accounts.dex_state.key();
    // let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    // let old = dex_state.launch_fee_rate;
    // #[cfg(feature = "enable-log")]
    // msg!(
    //     "update_launch_fee_rate, old:{}, new:{}",
    //     old,
    //     launch_fee_rate,
    // );

    // emit!(UpdateDexLaunchFeeRateEvent {
    //     dex_id,
    //     old,
    //     new: launch_fee_rate,
    // });

    // dex_state.launch_fee_rate = launch_fee_rate;

    let config = &mut ctx.accounts.config;
    config.vault_reserve_bound = vault_reserve_bound;

    Ok(())
}

pub fn update_initial_reserve(ctx: Context<UpdateConfigState>, initial_reserve: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.initial_reserve = initial_reserve;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfigState<'info> {
    #[account(mut, address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEX_CONFIG_SEED.as_bytes(),],
        bump = config.bump
    )]
    pub config: Box<Account<'info, ConfigState>>,
    #[account(
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes(),],
        bump = authority_manager.bump
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
}
