package com.reddblock.androidblock

enum class BlockKind {
    APP,
    WEBSITE
}

enum class BlockSource {
    ONE_OFF,
    SCHEDULE
}

data class BlockMatch(
    val blocklistName: String,
    val blocklistColor: String?,
    val blocklistEmoji: String?,
    val blockedLabel: String,
    val blockedPackage: String?,
    val blockedDomain: String?,
    val blockKind: BlockKind,
    val blockSource: BlockSource,
    val segmentStartedAtMs: Long?,
    val segmentEndsAtMs: Long?
)
