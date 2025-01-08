use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

pub fn update_config_admin(ctx: Context<UpdateConfigState>, new_admin: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require_keys_neq!(new_admin, Pubkey::default());

    #[cfg(feature = "enable-log")]
    msg!(
        "update_config_admin, old:{}, new:{}",
        config.admin.to_string(),
        new_admin.key().to_string()
    );

    config.admin = new_admin;

    Ok(())
}

pub fn update_create_dex(ctx: Context<UpdateConfigState>, disable_or_enable: bool) -> Result<()> {
    let config = &mut ctx.accounts.config;

    #[cfg(feature = "enable-log")]
    msg!(
        "update_create_dex, old:{}, new:{}",
        config.disable_create_dex,
        disable_or_enable,
    );

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
