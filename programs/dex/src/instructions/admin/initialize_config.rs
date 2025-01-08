use crate::states::*;
use anchor_lang::prelude::*;
use std::ops::DerefMut;

#[derive(Accounts)]
#[instruction(index: u16)]
pub struct CreateConfig<'info> {
    /// Address to be set as protocol owner.
    #[account(mut)]
    pub owner: Signer<'info>,
    /// Initialize config state account to store protocol admin address.
    #[account(
        init,
        seeds = [
            CONFIG_SEED.as_bytes(),
            &index.to_be_bytes()
        ],
        bump,
        payer = owner,
        space = Config::LEN
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_config(ctx: Context<CreateConfig>, index: u16) -> Result<()> {
    let config_id = ctx.accounts.config.key();
    let config = ctx.accounts.config.deref_mut();
    config.admin = ctx.accounts.owner.key();
    config.bump = ctx.bumps.config;
    config.disable_create_dex = false;
    config.index = index;

    #[cfg(feature = "enable-log")]
    msg!("initialize_config, index:{}", index);

    emit!(InitializeConfigEvent {
        config_id,
        admin: config.admin,
    });

    Ok(())
}
