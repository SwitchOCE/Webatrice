# f03 status
- 15:24Z started; old tip  → checkout work branch
- 15:32Z rebased: f24ddd9 folded into 5318b16 (now c158cb6), fixture + optional loginFailureCode in 47d15e6 (now ae5a355); typecheck OK at every commit; pushed 7fd7c81 → capability minimums
- 15:38Z capability minimums (b4dcce3) + password-change flow (4682fcf) pushed → query contract failure path
- 15:42Z query onFailure path pushed (3818e80) → full gate
- ACK M1: replacing per-call onFailure with scope-level optional commandFailed(command, responseCode, target, failure?) + Datatrice signals, copied from parity/13; reworking 3818e80
