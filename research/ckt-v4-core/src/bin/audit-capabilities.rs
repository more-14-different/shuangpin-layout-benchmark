use ckt_v4_core::{SchemeFixture, audit_fixture};
use std::env;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let schemes = PathBuf::from(
        args.next()
            .ok_or("usage: audit-capabilities SCHEMES OUTPUT")?,
    );
    let output = PathBuf::from(
        args.next()
            .ok_or("usage: audit-capabilities SCHEMES OUTPUT")?,
    );
    if args.next().is_some() {
        return Err("usage: audit-capabilities SCHEMES OUTPUT".to_owned());
    }
    let fixture = SchemeFixture::open(schemes)?;
    let audit = audit_fixture(&fixture)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(&audit).map_err(|error| error.to_string())?;
    fs::write(&output, bytes).map_err(|error| error.to_string())?;
    eprintln!(
        "wrote {} ({} schemes)",
        output.display(),
        audit.schemes.len()
    );
    Ok(())
}
