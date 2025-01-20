use super::*;

pub fn generate_leaf(pubkey: &Pubkey, amount: u64) -> [u8; 32] {
    keccak::hashv(&[pubkey.as_ref(), &amount.to_le_bytes()]).0
}

pub fn merkle_proof_verify(merkle_root: [u8; 32], proofs: Vec<[u8; 32]>, leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for prof in proofs {
        if computed_hash <= prof {
            computed_hash = keccak::hashv(&[&computed_hash, &prof]).0;
        } else {
            computed_hash = keccak::hashv(&[&prof, &computed_hash]).0;
        }
    }

    merkle_root == computed_hash
}
