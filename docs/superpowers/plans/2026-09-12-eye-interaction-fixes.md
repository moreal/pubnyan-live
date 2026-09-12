# Eye interaction fixes implementation plan

**Goal:** Preserve the current expression's pupils during reactions, restore source normal eyes, and conceal expression topology changes in a blink.
**Spec:** `docs/eye-interaction-audit.md`, approved by the user's request to implement the fixes.
**Architecture:** Separate drawable opacity from geometry selection in Rive. Extract original eyes through the rig map. Use internal closed-eye bridge states for topology changes, with exit-time transitions and a null closed rig shape. Remove ineffective curious pupil tracks.
**Constraints:** Do not hand edit generated rigs or vendor artwork. Keep the existing input names and calm motion. The user has authorized the audited exporter changes. Do not commit.

- [x] Add real-Rive regressions for absent pupils and cry geometry under every reaction; observe failure.
- [x] Add a drawing-only opacity node per part. Preserve shape visibility/vertices when reaction tracks omit shape. Verify regressions.
- [x] Add normal eye source-path fidelity checks; observe failure. Restore aligned source overrides via extraction, adjusting happy morph compatibility if needed.
- [x] Remove ineffective curious pupil movement; retain source white contour acting.
- [x] Add internal closed-eye bridge states, a null closed rig shape, and exit-at-end transitions; verify actual intermediate Rive frames, interruption, and recovery.
- [x] Run type checks, tests, and full verify; inspect touched clip contact sheets. Update audit and motion documentation.
