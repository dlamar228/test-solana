use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

use std::ops::DerefMut;

pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey, index: u16) -> Result<()> {
    require_keys_neq!(admin, Pubkey::default());

    let config_id = ctx.accounts.config.key();
    let config = ctx.accounts.config.deref_mut();
    config.admin = admin;
    config.bump = ctx.bumps.config;
    config.disable_create_dex = false;
    config.index = index;

    #[cfg(feature = "enable-log")]
    msg!("initialize_config, index:{}", index);

    emit!(InitializeConfigEvent {
        config_id,
        index,
        admin: config.admin,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(admin: Pubkey, index: u16)]
pub struct InitializeConfig<'info> {
    #[account(mut, address = protocol.admin)]
    pub signer: Signer<'info>,
    #[account(
        seeds = [
            DEX_PROTOCOL_SEED.as_bytes(),
        ],
        bump,
    )]
    pub protocol: Account<'info, ProtocolState>,
    /// Initialize config state account to store protocol admin address.
    #[account(
        init,
        seeds = [
            DEX_CONFIG_SEED.as_bytes(),
            &index.to_be_bytes()
        ],
        bump,
        payer = signer,
        space = Config::LEN
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn update_config_admin(ctx: Context<UpdateConfigState>, new_admin: Pubkey) -> Result<()> {
    let config_id = ctx.accounts.config.key();
    let config = &mut ctx.accounts.config;
    require_keys_neq!(new_admin, Pubkey::default());

    #[cfg(feature = "enable-log")]
    msg!(
        "update_config_admin, old:{}, new:{}",
        config.admin.to_string(),
        new_admin.key().to_string()
    );

    emit!(UpdateConfigAdminEvent {
        config_id,
        old: config.admin,
        new: new_admin,
    });

    config.admin = new_admin;

    Ok(())
}

pub fn update_create_dex(ctx: Context<UpdateConfigState>, disable_or_enable: bool) -> Result<()> {
    let config_id = ctx.accounts.config.key();
    let config = &mut ctx.accounts.config;

    #[cfg(feature = "enable-log")]
    msg!(
        "update_create_dex, old:{}, new:{}",
        config.disable_create_dex,
        disable_or_enable,
    );

    emit!(UpdateCreateDexEvent {
        config_id,
        old: config.disable_create_dex,
        new: disable_or_enable,
    });

    config.disable_create_dex = disable_or_enable;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateConfigState<'info> {
    #[account(address = config.admin @ ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub config: Account<'info, Config>,
}
