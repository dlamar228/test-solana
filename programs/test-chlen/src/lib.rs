use anchor_lang::prelude::*;

declare_id!("3ksKj17cGKP7oZ8YtexAEbvxqNQaBfSB3F5ZCLjBX79X");

#[program]
pub mod test_chlen {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
