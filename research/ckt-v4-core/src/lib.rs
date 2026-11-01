pub mod binary;
pub mod capability;
pub mod compact;
#[cfg(feature = "cuda")]
mod cuda;
pub mod ergonomics;
pub mod exploration_db;
pub mod explorer;
pub mod frontier;
pub mod frontier_log;
pub mod incremental;
pub mod model;
pub mod motor;
pub mod moving_hand;
pub mod native;
pub mod search;

pub use binary::{BinaryCase, BinaryCorpus, BinaryExtension, BinaryFixture, BinaryHeader};
pub use capability::{
    CapabilityAudit, CapabilityReason, Common399Policy, SchemeCapability, audit_fixture,
    audit_scheme,
};
pub use compact::{KeyAlphabet, PackedCode};
#[cfg(feature = "cuda")]
pub use cuda::{CudaResolvePlan, CudaResolveTimings, cuda_device_name, resolve_cuda};
pub use ergonomics::{
    ErgonomicFixture, ErgonomicGuards, ExpectedErgonomics, LoadDiagnostics, TokenLoadModel,
    TrackRoles,
};
pub use exploration_db::{
    EXPLORATION_DATABASE_VERSION, ExplorationDatabase, ExplorationStateLookup,
};
pub use explorer::{
    EXPLORATION_ARCHIVE_VERSION, EXPLORATION_PLAN_VERSION, ExplorationArchive, ExplorationBatch,
    ExplorationConfig, ExplorationEntry, ExplorationPlan, ReviewCandidate, SeedRecommendation,
    layout_distance, layout_state_bytes, layout_state_key, update_and_plan,
};
pub use frontier::{
    ErgonomicFrontierMetrics, ErgonomicMetricSchema, ExactFrontier, FrontierMetrics, FrontierPoint,
    MetricDefinition, MetricDirection, MetricVerification, canonical_layout_bytes,
};
pub use frontier_log::{FrontierLogProvenance, FrontierLogWriter, LogRecovery, read_frontier_log};
pub use incremental::{IncrementalResolver, OutcomeChange, UpdateReceipt};
pub use model::{
    CognitiveParameters, Contract, IncrementalSummary, Kind, Outcome, Pool, Row, Stage, Summary,
    TrackSummary, composite_score, resolve, stage_pools, summarize,
};
pub use motor::{MotorValue, ProjectedMotor, Projection, RoleTables, RoleTablesInput};
pub use moving_hand::{
    CorpusVariant, KeyGeometry, MovingHandCorpus, MovingHandModel, MovingHandSummary,
    MovingHandToken, RowStagger,
};
pub use native::{
    DependencyIndex, GeneratedRows, InputMode, LayoutDiagnostics, NativeCorpus, NativeCorpusCounts,
    NativeCorpusHeader, RegularLayout, SchemeFixture, SchemeInput, SchemeState,
};
pub use search::{
    DEFAULT_MAX_PROPOSAL_ATTEMPTS, NATIVE_ANNEAL_CHECKPOINT_VERSION, NATIVE_PROPOSAL_POLICY,
    PROPOSAL_KIND_COUNT, ProposalContext, ProposalError, ProposalKind, ProposalResult,
    ProposalStats, SearchRng, propose, propose_valid, validate_checkpoint_contract,
    validate_proposal,
};
