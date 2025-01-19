use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    protocol.admin = ctx.accounts.signer.key();

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account( 
        init,
        seeds = [DEX_PROTOCOL_SEED.as_bytes()],
        bump,
        payer = signer,
        space = ProtocolState::LEN
    )]
    pub protocol: Account<'info, ProtocolState>,
    pub system_program: Program<'info, System>,
}

pub fn update_protocol_admin(
    ctx: Context<UpdateProtocolState>,
    new_protocol_admin: Pubkey,
) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    require_keys_neq!(new_protocol_admin, Pubkey::default());

    #[cfg(feature = "enable-log")]
    msg!(
        "update_protocol_admin, old:{}, new:{}",
        protocol.admin,
        new_protocol_admin.key()
    );

    emit!(UpdateProtocolAdminEvent {
        old: protocol.admin,
        new: new_protocol_admin,
    });

    protocol.admin = new_protocol_admin;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProtocolState<'info> {
    #[account(address = protocol.admin @ ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub protocol: Account<'info, ProtocolState>,
}
