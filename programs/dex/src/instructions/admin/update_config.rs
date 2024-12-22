use crate::curve::MAX_FEE_RATE_VALUE;
use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateAmmConfig<'info> {
    /// The amm config owner
    #[account(address = amm_config.protocol_owner @ ErrorCode::InvalidProtocolOwner)]
    pub owner: Signer<'info>,

    /// Amm config account to be changed
    #[account(mut)]
    pub amm_config: Account<'info, AmmConfig>,
}

pub fn update_amm_config(ctx: Context<UpdateAmmConfig>, param: u8, value: u64) -> Result<()> {
    let amm_config = &mut ctx.accounts.amm_config;
    match param {
        0 => update_protocol_fee_rate(amm_config, value),
        1 => update_launch_fee_rate(amm_config, value),
        2 => {
            let new_protocol_owner = *ctx.remaining_accounts.iter().next().unwrap().key;
            set_new_protocol_owner(amm_config, new_protocol_owner)?;
        }
        3 => amm_config.disable_create_dex = value != 0,
        _ => return err!(ErrorCode::InvalidInput),
    }

    Ok(())
}

fn update_protocol_fee_rate(amm_config: &mut Account<AmmConfig>, protocol_fee_rate: u64) {
    assert!(protocol_fee_rate <= MAX_FEE_RATE_VALUE);
    amm_config.protocol_fee_rate = protocol_fee_rate;
}

fn update_launch_fee_rate(amm_config: &mut Account<AmmConfig>, launch_fee_rate: u64) {
    assert!(launch_fee_rate <= MAX_FEE_RATE_VALUE);
    amm_config.launch_fee_rate = launch_fee_rate;
}

fn set_new_protocol_owner(amm_config: &mut Account<AmmConfig>, new_owner: Pubkey) -> Result<()> {
    require_keys_neq!(new_owner, Pubkey::default());
    #[cfg(feature = "enable-log")]
    msg!(
        "amm_config, old_protocol_owner:{}, new_owner:{}",
        amm_config.protocol_owner.to_string(),
        new_owner.key().to_string()
    );
    amm_config.protocol_owner = new_owner;
    Ok(())
}
