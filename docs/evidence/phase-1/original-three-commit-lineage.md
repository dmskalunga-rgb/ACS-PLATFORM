# Phase 1 Original Three-Commit Lineage

Status: `PRE_REMEDIATION_PRESERVATION_EVIDENCE`

Recorded before selective-adoption remediation on 2026-08-09. This record preserves the
provenance of the three commits authorized for reconciliation. It does not approve their
original contents and does not change the status `PHASE_1_NOT_YET_VERIFIED`.

## Repository state

- Repository root: `D:/ACS-PLATFORM`
- Base branch: `develop`
- Base and `origin/develop`: `c5bea416dbc71f83c485fa92817e5850d4de88f3`
- Working branch: `feat/phase-1-platform-multitenancy`
- Original branch HEAD: `683bccbaf09ea10a89399691449475e9916dfc79`
- Original remote branch HEAD: `043619e3712f15f1dd0e2b38085c63fcb5a48035`
- Original working tree: clean
- Original divergence from `develop`: 3 ahead, 0 behind
- Original local divergence from remote branch: 2 ahead, 0 behind

## Preserved commits

| Label    | Commit                                     | Parent                                     | Tree                                       | Stable patch ID                            | Original state                |
| -------- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ | ----------------------------- |
| Commit 0 | `043619e3712f15f1dd0e2b38085c63fcb5a48035` | `c5bea416dbc71f83c485fa92817e5850d4de88f3` | `1a8e7b1af314b8fe60f4a9167268980c7f6f592f` | `98c7449b6f02502a70978971d628bcdff94d45fc` | `ALREADY_PUBLISHED_ON_BRANCH` |
| Commit A | `ac13953715134c1e37f862a1af9b5205f58083a7` | `043619e3712f15f1dd0e2b38085c63fcb5a48035` | `ed70e6e73cc8d5edf9d7acdf52462849c87ad92a` | `90e5f2b6be67a8e3c285d1167be98e83a2b4cd26` | `LOCAL_ONLY`                  |
| Commit B | `683bccbaf09ea10a89399691449475e9916dfc79` | `ac13953715134c1e37f862a1af9b5205f58083a7` | `fdda07b0efe6ebf4e8b019f44c32a2a780a983c7` | `69b0365b6f13e7fc0ea8453f20f9c440a904ebca` | `LOCAL_ONLY`                  |

The original diffs remain recoverable directly from these immutable Git objects with
`git show <commit>`. Remediation is added only through descendant commits; no force push,
reset, squash, rebase, or deletion is authorized.
