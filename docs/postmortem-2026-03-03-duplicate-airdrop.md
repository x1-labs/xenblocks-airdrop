# Postmortem: Duplicate Airdrop — 2026-03-03

**Date of incident:** 2026-03-03 00:01 UTC
**Date of discovery:** 2026-03-05
**Severity:** Medium — tokens overpaid, no loss of funds beyond excess distribution
**Status:** Root cause identified, fix pending

---

## Summary

Two airdrop processes ran 7 seconds apart (Runs #21 and #22). Both read the same on-chain state before either finished writing, so both computed and applied the same token deltas. 114 accounts were double-paid **~2.69M tokens** total (XNM, XBLK, XUNI combined), matching Run #22's recorded totalAmount of 2,859,584.5 after accounting for continued mining between the incident and audit. The system has no locking to prevent concurrent runs, and the on-chain program uses `checked_add` (additive deltas) rather than absolute-set, so the duplicate was silently applied. Fix requires adding run locking and moving to idempotent record updates.

---

## Timeline

All times UTC on 2026-03-03 unless noted.

| Time | Event |
|------|-------|
| 00:01:22 | Run #21 starts — fetches on-chain snapshots, computes deltas for 271 recipients |
| 00:01:29 | Run #22 starts (7 seconds later) — fetches on-chain snapshots **before Run #21 has finished writing** |
| ~00:01:22–00:25:00 | Both runs process recipients concurrently, submitting transactions to the network |
| 00:26:14 | Run #23 starts — finds 0 recipients (both prior runs have completed, records are up to date) |
| **2026-03-05** | Audit script identifies 306 overpayments across 114 unique accounts |

---

## Impact

### Overpayment totals (as of audit on 2026-03-05)

| Token | Overpaid Accounts | Excess Tokens |
|-------|-------------------|---------------|
| XNM   | 114               | 1,793,612.5   |
| XBLK  | 80                | 855           |
| XUNI  | 112               | 899,448       |
| **Total** | **114 unique** | **2,693,915.5** |

Note: 114 accounts each have XNM overpayments, but not all have XBLK/XUNI overpayments because some had zero deltas for those tokens.

### Correlation with Run #22

| Metric | Value |
|--------|-------|
| Run #22 totalAmount | 2,859,584.5 tokens |
| Audit excess (Mar 5) | 2,693,915.5 tokens |
| Difference | 165,669 tokens |

The 165,669 token gap is explained by miners continuing to earn between Mar 3 (incident) and Mar 5 (audit). As API amounts grow, the apparent excess (on-chain minus API) shrinks. If we had the API values from Mar 3, the excess would match Run #22's totalAmount exactly.

### Top overpaid accounts

```
ETH Address                                 Token  Excess
0x05b9cd4e53a375455deeec995f538cf29da748c6  XNM    282,095
0x800206426a595419cdafdd12795157f3f7746459  XNM    50,707.5
0x2a7299d5473e23855c8f94521de0b9a419e68d15  XNM    48,130
0x5ab5f206f36a73e5eef2278d9ac1e9b31e7ec1ef  XNM    47,965
0x1c72b3953ffe2e0325bd297a39e3f1409a4e5562  XNM    42,065
```

---

## Root Cause

### The bug: no protection against concurrent runs

The airdrop executor (`src/airdrop/executor.ts`) follows this sequence:

```
1. Create on-chain AirdropRun record               (line 268)
2. Fetch all miners from API                        (line 277)
3. Fetch all on-chain snapshots via getProgramAccounts  (line 305)
4. Calculate deltas: API amount - on-chain amount   (line 315)
5. For each recipient, atomically:
   a. Transfer tokens                               (line 456-470)
   b. Update on-chain record via checked_add        (line 472-482)
6. Update run totals                                (line 425)
```

The critical issue is at **step 3**: the on-chain snapshot is fetched once and used for all delta calculations. If a second run starts before the first finishes writing records in step 5, the second run reads **stale** on-chain data and computes the **same deltas** as the first run.

### How the on-chain program applies updates

The Anchor program (`programs/xenblocks-airdrop-tracker/src/lib.rs`) has two paths:

- **`initialize_and_update_v2`** — for new records: directly **sets** the amount (correct)
- **`update_record_v2`** — for existing records: uses `checked_add` to **add** the delta to the existing cumulative total

When Run #22 processed the 114 accounts that Run #21 was already updating:
- Run #21 had already initialized these records and was adding deltas
- Run #22 saw the records as already existing (initialized by Run #21)
- Run #22 called `update_record_v2` with the same delta values
- `checked_add` added the delta a second time

### Why this happened on this date

Before 2026-03-03, the airdrop had been run manually in single-run mode. On this date, either:
- Two instances were launched concurrently (e.g., manual + cron, or two terminal sessions)
- The interval mode check did not prevent overlap because the last run date hadn't been committed yet

The interval mode in `src/index.ts` checks the last run date on-chain before starting, but the run is created at the beginning of execution (step 1), not at the end. Two processes starting near-simultaneously would both see the same "last run date" and both proceed.

---

## Full Airdrop Run History

```
Run  Date                      Recipients  Total Amount            Dry Run
---  ----                      ----------  ------------            -------
1    2026-01-27T01:45:53.000Z  0           0                       yes
2    2026-01-27T02:09:43.000Z  0           0                       yes
3    2026-01-27T02:10:02.000Z  0           0                       yes
4    2026-01-27T02:12:11.000Z  0           0                       yes
5    2026-01-27T02:12:58.000Z  1           753955                  no
6    2026-01-27T04:52:49.000Z  0           0                       yes
7    2026-01-27T23:06:51.000Z  0           0                       yes
8    2026-01-27T23:07:36.000Z  7604        451967556               no
9    2026-03-02T22:37:01.000Z  0           0                       yes
10   2026-03-02T22:37:40.000Z  0           0                       yes
11   2026-03-02T23:16:03.000Z  0           0                       no
12   2026-03-02T23:18:05.000Z  0           0                       yes
13   2026-03-02T23:20:02.000Z  0           0                       no
14   2026-03-02T23:21:38.000Z  0           0                       no
15   2026-03-02T23:21:45.000Z  0           0                       no
16   2026-03-02T23:22:48.000Z  0           0                       yes
17   2026-03-02T23:23:31.000Z  0           0                       yes
18   2026-03-02T23:38:28.000Z  0           0                       yes
19   2026-03-02T23:39:02.000Z  0           0                       yes
20   2026-03-02T23:40:42.000Z  0           0                       no
21   2026-03-03T00:01:22.000Z  271         24301003.999999998      no      <-- primary run
22   2026-03-03T00:01:29.000Z  114         2859584.5               no      <-- duplicate (7s later)
23   2026-03-03T00:26:14.000Z  0           0                       no
24   2026-03-03T00:27:14.000Z  0           0                       yes
25   2026-03-03T00:27:52.000Z  22          3961.500000001          no
26   2026-03-03T00:43:28.000Z  0           0                       no
27   2026-03-03T01:49:59.000Z  25          10744.5                 no
```

Key observations:
- Run #22 started 7 seconds after Run #21
- Run #22's 114 recipients are a subset of Run #21's 271 recipients
- Run #23 (25 minutes later) found 0 recipients — both runs had completed by then
- Runs #25 and #27 processed small batches (new miners who joined after the incident)

---

## Full Audit Output (2026-03-05)

```
ETH Address                                 Token   API Amount (9 dec)          On-Chain (9 dec)            Excess (9 dec)              Sol Address
----------------------------------------------------------------------------------------------------------------------------------------------------------------
0xaff2c740bbabe9b6a4b4759a52b3c419d18ec932  XNM     1492.5                      1580                        87.5                        9WSVUpwRmrt1KaTBMC6o4ySw9izh41gxUF5KhTHdnfVg
0xaff2c740bbabe9b6a4b4759a52b3c419d18ec932  XUNI    562                         621                         59                          9WSVUpwRmrt1KaTBMC6o4ySw9izh41gxUF5KhTHdnfVg
0x45be931051a89ff2af907c56c4bd0b6f203c07ab  XNM     808870                      834565                      25695                       5eiZUcoDbiBTt1impbCq1Mo9Re8BcvKRz1Mdz7WgzFXg
0x45be931051a89ff2af907c56c4bd0b6f203c07ab  XBLK    208                         224                         16                          5eiZUcoDbiBTt1impbCq1Mo9Re8BcvKRz1Mdz7WgzFXg
0x45be931051a89ff2af907c56c4bd0b6f203c07ab  XUNI    176548                      186769                      10221                       5eiZUcoDbiBTt1impbCq1Mo9Re8BcvKRz1Mdz7WgzFXg
0xa554aa094f4dd7b03c71f1ad760835f8240c8dbd  XNM     102090                      108980                      6890                        DvFfB9BBN8qXrxZS36kNJGnQJzProkfRReGLvEG7NZTN
0xa554aa094f4dd7b03c71f1ad760835f8240c8dbd  XBLK    24                          26                          2                           DvFfB9BBN8qXrxZS36kNJGnQJzProkfRReGLvEG7NZTN
0xa554aa094f4dd7b03c71f1ad760835f8240c8dbd  XUNI    22965                       25727                       2762                        DvFfB9BBN8qXrxZS36kNJGnQJzProkfRReGLvEG7NZTN
0xef39e9960c9f5fb2b2b60f466d6bf88718e0ce09  XNM     365325                      377147.5                    11822.5                     AgVgfRUGSWvAHd2am9pq15TVcvpxjJru1efCKA3Gzy5j
0xef39e9960c9f5fb2b2b60f466d6bf88718e0ce09  XBLK    101                         103                         2                           AgVgfRUGSWvAHd2am9pq15TVcvpxjJru1efCKA3Gzy5j
0xef39e9960c9f5fb2b2b60f466d6bf88718e0ce09  XUNI    95569                       100333                      4764                        AgVgfRUGSWvAHd2am9pq15TVcvpxjJru1efCKA3Gzy5j
0x5792d034e27da0ab605eff485701cb68a87e668c  XNM     465915                      484587.5                    18672.5                     8euAVMyfRSZBaa6vRFeuen2Y8B938BkEvpL7XTzwvi4Z
0x5792d034e27da0ab605eff485701cb68a87e668c  XBLK    115                         127                         12                          8euAVMyfRSZBaa6vRFeuen2Y8B938BkEvpL7XTzwvi4Z
0x5792d034e27da0ab605eff485701cb68a87e668c  XUNI    102456                      109756                      7300                        8euAVMyfRSZBaa6vRFeuen2Y8B938BkEvpL7XTzwvi4Z
0x9271bc1fcb3a7ad21d24b1071fce1ae47ca99c64  XNM     93860                       122615                      28755                       96YgsERSFCfLyYnT8ww6vRAndtSQEffUxvQ6PJxxLGku
0x9271bc1fcb3a7ad21d24b1071fce1ae47ca99c64  XBLK    40                          53                          13                          96YgsERSFCfLyYnT8ww6vRAndtSQEffUxvQ6PJxxLGku
0x9271bc1fcb3a7ad21d24b1071fce1ae47ca99c64  XUNI    35438                       47346                       11908                       96YgsERSFCfLyYnT8ww6vRAndtSQEffUxvQ6PJxxLGku
0xc22e5dbe6de18887f8bca667c547b854ca3eaa64  XNM     161877.5                    170137.5                    8260                        9Qf1p3ZT1TmAuSf9uRinbzq5rrKw6cZt3DRy5r7pQA5R
0xc22e5dbe6de18887f8bca667c547b854ca3eaa64  XBLK    42                          45                          3                           9Qf1p3ZT1TmAuSf9uRinbzq5rrKw6cZt3DRy5r7pQA5R
0xc22e5dbe6de18887f8bca667c547b854ca3eaa64  XUNI    37486                       40769                       3283                        9Qf1p3ZT1TmAuSf9uRinbzq5rrKw6cZt3DRy5r7pQA5R
0x77c5369a71a697aa5f498487056a9af238f54e15  XNM     307027.5                    315150                      8122.5                      BdW1uXrtXhm7dFAB2a94dJSMM98pFrd7hKdAoM1M5PAs
0x77c5369a71a697aa5f498487056a9af238f54e15  XBLK    84                          85                          1                           BdW1uXrtXhm7dFAB2a94dJSMM98pFrd7hKdAoM1M5PAs
0x77c5369a71a697aa5f498487056a9af238f54e15  XUNI    70916                       74129                       3213                        BdW1uXrtXhm7dFAB2a94dJSMM98pFrd7hKdAoM1M5PAs
0x56a5e7c0a48e31cfe3b286cf9951bc7819d09fc4  XNM     46532.5                     64860                       18327.5                     EkD5XJrfgbZbBZ6zYx9Rdaqw4z2t4TCe6gh5BE4KJc76
0x56a5e7c0a48e31cfe3b286cf9951bc7819d09fc4  XBLK    13                          18                          5                           EkD5XJrfgbZbBZ6zYx9Rdaqw4z2t4TCe6gh5BE4KJc76
0x56a5e7c0a48e31cfe3b286cf9951bc7819d09fc4  XUNI    15924                       24079                       8155                        EkD5XJrfgbZbBZ6zYx9Rdaqw4z2t4TCe6gh5BE4KJc76
0x40e9f40c8318d1d79bf56d10149e1a65f0b1df36  XNM     6170                        6352.5                      182.5                       AxjYipkqKyfTFZ2eKLpp2m6BKH4wwVpNdizfAubyhoNu
0x40e9f40c8318d1d79bf56d10149e1a65f0b1df36  XUNI    1438                        1545                        107                         AxjYipkqKyfTFZ2eKLpp2m6BKH4wwVpNdizfAubyhoNu
0x068d78d1a9e5cfd07204a695a86e9a473d823fb6  XNM     145767.5                    161262.5                    15495                       GAx1dNQcWzh5pAK9WrJAY3tE52Uv8BwMSEvZCCKATuNj
0x068d78d1a9e5cfd07204a695a86e9a473d823fb6  XBLK    44                          55                          11                          GAx1dNQcWzh5pAK9WrJAY3tE52Uv8BwMSEvZCCKATuNj
0x068d78d1a9e5cfd07204a695a86e9a473d823fb6  XUNI    43680                       50620                       6940                        GAx1dNQcWzh5pAK9WrJAY3tE52Uv8BwMSEvZCCKATuNj
0xbc3f4e979a03345cabe8db0a40ce1b4dc41a4bc8  XNM     60587.5                     66080                       5492.5                      DhAYLnabk5YaRKR7FuPMt4R31aQXnQdAekx4N8j7eZxA
0xbc3f4e979a03345cabe8db0a40ce1b4dc41a4bc8  XBLK    16                          19                          3                           DhAYLnabk5YaRKR7FuPMt4R31aQXnQdAekx4N8j7eZxA
0xbc3f4e979a03345cabe8db0a40ce1b4dc41a4bc8  XUNI    15680                       17670                       1990                        DhAYLnabk5YaRKR7FuPMt4R31aQXnQdAekx4N8j7eZxA
0x800206426a595419cdafdd12795157f3f7746459  XNM     1063212.5                   1113920                     50707.5                     2yF6S17rz4Q7eJRRTQLb7n42HtiLzZ6fnea5rynMkJy4
0x800206426a595419cdafdd12795157f3f7746459  XBLK    266                         278                         12                          2yF6S17rz4Q7eJRRTQLb7n42HtiLzZ6fnea5rynMkJy4
0x800206426a595419cdafdd12795157f3f7746459  XUNI    248640                      265236                      16596                       2yF6S17rz4Q7eJRRTQLb7n42HtiLzZ6fnea5rynMkJy4
0xeed5efed2de1ddce3c8c85d8e8a0b8ba6d71c61b  XNM     7870                        10120                       2250                        rMNxUG4Ltp5vhLKQ7Ps4PFZPYEXEdpnRF2v6g3oYfT6
0xeed5efed2de1ddce3c8c85d8e8a0b8ba6d71c61b  XBLK    3                           4                           1                           rMNxUG4Ltp5vhLKQ7Ps4PFZPYEXEdpnRF2v6g3oYfT6
0xeed5efed2de1ddce3c8c85d8e8a0b8ba6d71c61b  XUNI    2510                        3381                        871                         rMNxUG4Ltp5vhLKQ7Ps4PFZPYEXEdpnRF2v6g3oYfT6
0x0b48f05acb01a4c0c4b5c39f0de0e72068a4b1e7  XNM     184590                      186847.5                    2257.5                      EhKX9PiaqKsfExeRiJZjCRnFXQxLQ7mBdJJjUkxTJEtE
0x0b48f05acb01a4c0c4b5c39f0de0e72068a4b1e7  XBLK    37                          39                          2                           EhKX9PiaqKsfExeRiJZjCRnFXQxLQ7mBdJJjUkxTJEtE
0x0b48f05acb01a4c0c4b5c39f0de0e72068a4b1e7  XUNI    27768                       29080                       1312                        EhKX9PiaqKsfExeRiJZjCRnFXQxLQ7mBdJJjUkxTJEtE
0xe4bfefb35d0b1e3c56ef7655a42fde4d5d2eb8f1  XNM     147537.5                    152607.5                    5070                        HMC7YQs3tNYFJjQPSrSSjpb2Cp7oM2jSWY2kEBjmzKY7
0xe4bfefb35d0b1e3c56ef7655a42fde4d5d2eb8f1  XBLK    40                          46                          6                           HMC7YQs3tNYFJjQPSrSSjpb2Cp7oM2jSWY2kEBjmzKY7
0xe4bfefb35d0b1e3c56ef7655a42fde4d5d2eb8f1  XUNI    38012                       40828                       2816                        HMC7YQs3tNYFJjQPSrSSjpb2Cp7oM2jSWY2kEBjmzKY7
0x4cc34e52c5e03126d4ccdb4264be35b0e5a50624  XNM     28470                       31260                       2790                        GNffgWjwGBkwh3vJHw5bRdmLzk7gUV3USyKcmKcN3FXi
0x4cc34e52c5e03126d4ccdb4264be35b0e5a50624  XBLK    8                           9                           1                           GNffgWjwGBkwh3vJHw5bRdmLzk7gUV3USyKcmKcN3FXi
0x4cc34e52c5e03126d4ccdb4264be35b0e5a50624  XUNI    7070                        8029                        959                         GNffgWjwGBkwh3vJHw5bRdmLzk7gUV3USyKcmKcN3FXi
0x050e3da5aef67d18bd4d5e3cc4c6a2e4b80a5856  XNM     56020                       59347.5                     3327.5                      3AVUB3CjByqFDHTBV2c1f8TwuHqKgZM3i5kKnfhLJH3r
0x050e3da5aef67d18bd4d5e3cc4c6a2e4b80a5856  XBLK    8                           11                          3                           3AVUB3CjByqFDHTBV2c1f8TwuHqKgZM3i5kKnfhLJH3r
0x050e3da5aef67d18bd4d5e3cc4c6a2e4b80a5856  XUNI    4380                        5449                        1069                        3AVUB3CjByqFDHTBV2c1f8TwuHqKgZM3i5kKnfhLJH3r
0x7fd555a5b6ec4613b3a0b4fbd1bb2c8891b0ac56  XNM     36895                       41645                       4750                        5sNtD7ePSoVLkNJHMWkJzXS4nfK33P4gX7qJhdcxcgWv
0x7fd555a5b6ec4613b3a0b4fbd1bb2c8891b0ac56  XBLK    11                          13                          2                           5sNtD7ePSoVLkNJHMWkJzXS4nfK33P4gX7qJhdcxcgWv
0x7fd555a5b6ec4613b3a0b4fbd1bb2c8891b0ac56  XUNI    9722                        11413                       1691                        5sNtD7ePSoVLkNJHMWkJzXS4nfK33P4gX7qJhdcxcgWv
0x88ec20a8e7ea7f2e41f0bea7c0164ae2e8209378  XNM     101660                      118510                      16850                       3eSKraqXCTuiA3RWXybcjHk5bLzYrPM3PYi8NLqJWtN3
0x88ec20a8e7ea7f2e41f0bea7c0164ae2e8209378  XBLK    30                          35                          5                           3eSKraqXCTuiA3RWXybcjHk5bLzYrPM3PYi8NLqJWtN3
0x88ec20a8e7ea7f2e41f0bea7c0164ae2e8209378  XUNI    19872                       24006                       4134                        3eSKraqXCTuiA3RWXybcjHk5bLzYrPM3PYi8NLqJWtN3
0x48ea0c93b78d7c55e56d6b9d69e46af21f23aeb1  XNM     87490                       89692.5                     2202.5                      9qbR3b1uRKXiuECpz2hZmhUf9S1i2HMSXd8thNfSdBPL
0x48ea0c93b78d7c55e56d6b9d69e46af21f23aeb1  XUNI    17648                       18502                       854                         9qbR3b1uRKXiuECpz2hZmhUf9S1i2HMSXd8thNfSdBPL
0xb3e91c0f4f7f9988e42d5d5ff87c0411a2e9a89e  XNM     120917.5                    139370                      18452.5                     8CrHzCWptX1XRkJMc3uCWKqWdDdBE1E5z1CGpWJnXzzh
0xb3e91c0f4f7f9988e42d5d5ff87c0411a2e9a89e  XBLK    34                          39                          5                           8CrHzCWptX1XRkJMc3uCWKqWdDdBE1E5z1CGpWJnXzzh
0xb3e91c0f4f7f9988e42d5d5ff87c0411a2e9a89e  XUNI    38740                       45893                       7153                        8CrHzCWptX1XRkJMc3uCWKqWdDdBE1E5z1CGpWJnXzzh
0x15b80c7c45f6c0e0bcb2e5d09faadbd29bf9c9c4  XNM     19630                       22260                       2630                        A2aMBKBGhSQvJUQ2eHGCPiwqCEaYr3V3iqpXiQ5B2b6E
0x15b80c7c45f6c0e0bcb2e5d09faadbd29bf9c9c4  XBLK    6                           7                           1                           A2aMBKBGhSQvJUQ2eHGCPiwqCEaYr3V3iqpXiQ5B2b6E
0x15b80c7c45f6c0e0bcb2e5d09faadbd29bf9c9c4  XUNI    6036                        7004                        968                         A2aMBKBGhSQvJUQ2eHGCPiwqCEaYr3V3iqpXiQ5B2b6E
0x5ab5f206f36a73e5eef2278d9ac1e9b31e7ec1ef  XNM     980477.5                    1028442.5                   47965                       ozYtzgyeJz4XQWYAytMF4TtQmVNp9HaBFuyRJoCDb8f
0x5ab5f206f36a73e5eef2278d9ac1e9b31e7ec1ef  XBLK    237                         253                         16                          ozYtzgyeJz4XQWYAytMF4TtQmVNp9HaBFuyRJoCDb8f
0x5ab5f206f36a73e5eef2278d9ac1e9b31e7ec1ef  XUNI    211940                      223748                      11808                       ozYtzgyeJz4XQWYAytMF4TtQmVNp9HaBFuyRJoCDb8f
0x1c72b3953ffe2e0325bd297a39e3f1409a4e5562  XNM     866457.5                    908522.5                    42065                       7GsrJar4MiANHzFqpwbjpYn9fqY5M9d3BHL1nh2yfyHH
0x1c72b3953ffe2e0325bd297a39e3f1409a4e5562  XBLK    227                         239                         12                          7GsrJar4MiANHzFqpwbjpYn9fqY5M9d3BHL1nh2yfyHH
0x1c72b3953ffe2e0325bd297a39e3f1409a4e5562  XUNI    193310                      205150                      11840                       7GsrJar4MiANHzFqpwbjpYn9fqY5M9d3BHL1nh2yfyHH
0x50a08f5d95af97c13e9ee7c83ad96acab447fc4f  XNM     39855                       44017.5                     4162.5                      37PsmWcLEfwF2f37sHbXUDUvpMTidqbxjVNvLWXBXSLY
0x50a08f5d95af97c13e9ee7c83ad96acab447fc4f  XBLK    10                          11                          1                           37PsmWcLEfwF2f37sHbXUDUvpMTidqbxjVNvLWXBXSLY
0x50a08f5d95af97c13e9ee7c83ad96acab447fc4f  XUNI    6942                        7932                        990                         37PsmWcLEfwF2f37sHbXUDUvpMTidqbxjVNvLWXBXSLY
0xab00aaa3c07ea1b40bec0cd3dbc1efb8f6ff0e33  XNM     67645                       69582.5                     1937.5                      6T8BhV2yWQnDpphqEYB8VK9xV2a6c8T7VjkqX3xA2pQu
0xab00aaa3c07ea1b40bec0cd3dbc1efb8f6ff0e33  XUNI    16792                       17527                       735                         6T8BhV2yWQnDpphqEYB8VK9xV2a6c8T7VjkqX3xA2pQu
0x05b9cd4e53a375455deeec995f538cf29da748c6  XNM     746235                      1028330                     282095                      Ce8ha7foaJTbC7jCcVKNsgk32KXyNvfDSTXjGcwNNjtr
0x05b9cd4e53a375455deeec995f538cf29da748c6  XBLK    202                         280                         78                          Ce8ha7foaJTbC7jCcVKNsgk32KXyNvfDSTXjGcwNNjtr
0x05b9cd4e53a375455deeec995f538cf29da748c6  XUNI    166740                      237308                      70568                       Ce8ha7foaJTbC7jCcVKNsgk32KXyNvfDSTXjGcwNNjtr
0x2a7299d5473e23855c8f94521de0b9a419e68d15  XNM     930282.5                    978412.5                    48130                       3hgSQuQ12625ay2MTz8zXJcpGEAAs5DJTJssMcBV76Vn
0x2a7299d5473e23855c8f94521de0b9a419e68d15  XBLK    253                         268                         15                          3hgSQuQ12625ay2MTz8zXJcpGEAAs5DJTJssMcBV76Vn
0x2a7299d5473e23855c8f94521de0b9a419e68d15  XUNI    222226                      240276                      18050                       3hgSQuQ12625ay2MTz8zXJcpGEAAs5DJTJssMcBV76Vn
0x4c45a303eb65e89672e520d70e3740b8f20cc58f  XNM     60200                       68620                       8420                        HjLZ4PshYNrXTh1LAi9MjH81Vy4FRuNVRcmHFTU4aTj3
0x4c45a303eb65e89672e520d70e3740b8f20cc58f  XBLK    19                          22                          3                           HjLZ4PshYNrXTh1LAi9MjH81Vy4FRuNVRcmHFTU4aTj3
0x4c45a303eb65e89672e520d70e3740b8f20cc58f  XUNI    17478                       20344                       2866                        HjLZ4PshYNrXTh1LAi9MjH81Vy4FRuNVRcmHFTU4aTj3
0x7a26b34e20e9c3b60bf075ef8ef35a42ce6a8ff4  XNM     163037.5                    181597.5                    18560                       9N75PiHvqGr7VxL3bLyXDuFJgGZXJZxaEqCD3pMt2s4s
0x7a26b34e20e9c3b60bf075ef8ef35a42ce6a8ff4  XBLK    43                          50                          7                           9N75PiHvqGr7VxL3bLyXDuFJgGZXJZxaEqCD3pMt2s4s
0x7a26b34e20e9c3b60bf075ef8ef35a42ce6a8ff4  XUNI    61612                       70990                       9378                        9N75PiHvqGr7VxL3bLyXDuFJgGZXJZxaEqCD3pMt2s4s
0x2cc5a44e5d21c19e0dbc10fd8f99bd2fc7a3a152  XNM     124272.5                    141177.5                    16905                       5sSKhX73B2YVKd3rMa3oBCnVZB4qBrKJp4rsDHyNiVpZ
0x2cc5a44e5d21c19e0dbc10fd8f99bd2fc7a3a152  XBLK    34                          39                          5                           5sSKhX73B2YVKd3rMa3oBCnVZB4qBrKJp4rsDHyNiVpZ
0x2cc5a44e5d21c19e0dbc10fd8f99bd2fc7a3a152  XUNI    32058                       37392                       5334                        5sSKhX73B2YVKd3rMa3oBCnVZB4qBrKJp4rsDHyNiVpZ
0x7e3fa48ec834dd04f0be8b67e549a7c2fb39f936  XNM     188755                      195137.5                    6382.5                      Ai8KdrjhPniCgUoHVc2pYaQCQbW3JfmDZXffDU1EWJ5b
0x7e3fa48ec834dd04f0be8b67e549a7c2fb39f936  XBLK    48                          50                          2                           Ai8KdrjhPniCgUoHVc2pYaQCQbW3JfmDZXffDU1EWJ5b
0x7e3fa48ec834dd04f0be8b67e549a7c2fb39f936  XUNI    36960                       39260                       2300                        Ai8KdrjhPniCgUoHVc2pYaQCQbW3JfmDZXffDU1EWJ5b
0x2f48a00437e3098ecc3ca1e7c8be28ce785b6bc2  XNM     36267.5                     38792.5                     2525                        8qbEuibFqxTt5tMqC3hCgXbftKL15gCT2uJMwWvFWxms
0x2f48a00437e3098ecc3ca1e7c8be28ce785b6bc2  XBLK    9                           11                          2                           8qbEuibFqxTt5tMqC3hCgXbftKL15gCT2uJMwWvFWxms
0x2f48a00437e3098ecc3ca1e7c8be28ce785b6bc2  XUNI    10474                       11367                       893                         8qbEuibFqxTt5tMqC3hCgXbftKL15gCT2uJMwWvFWxms
0xa0df3a85e756d516c4ed478d7d2d6a19e3b35c7c  XNM     159022.5                    179207.5                    20185                       CJqFwm5fvXRNx54EvAk3dftKTYrDK5YWbfK6G6Y7FCcb
0xa0df3a85e756d516c4ed478d7d2d6a19e3b35c7c  XBLK    46                          50                          4                           CJqFwm5fvXRNx54EvAk3dftKTYrDK5YWbfK6G6Y7FCcb
0xa0df3a85e756d516c4ed478d7d2d6a19e3b35c7c  XUNI    68414                       79710                       11296                       CJqFwm5fvXRNx54EvAk3dftKTYrDK5YWbfK6G6Y7FCcb
0x8cabe6d19b8e12d62f14b41c38aa3ed85b7a78e4  XNM     36107.5                     42037.5                     5930                        EJN4WVD3g65hMKFHeMvPxdxPm9DmNfZTpv3xvfBxQ4Tn
0x8cabe6d19b8e12d62f14b41c38aa3ed85b7a78e4  XBLK    11                          13                          2                           EJN4WVD3g65hMKFHeMvPxdxPm9DmNfZTpv3xvfBxQ4Tn
0x8cabe6d19b8e12d62f14b41c38aa3ed85b7a78e4  XUNI    11668                       13815                       2147                        EJN4WVD3g65hMKFHeMvPxdxPm9DmNfZTpv3xvfBxQ4Tn
0xb44f8e39506b5bf5a0f9e31bdf9b0eb0c4e94be1  XNM     65867.5                     67720                       1852.5                      FbfMXLjEZtisZkJsAU2MrBFCLfCxm7B3TWWCBW7w6E2Q
0xb44f8e39506b5bf5a0f9e31bdf9b0eb0c4e94be1  XBLK    15                          15                          0                           FbfMXLjEZtisZkJsAU2MrBFCLfCxm7B3TWWCBW7w6E2Q
0xb44f8e39506b5bf5a0f9e31bdf9b0eb0c4e94be1  XUNI    10792                       11516                       724                         FbfMXLjEZtisZkJsAU2MrBFCLfCxm7B3TWWCBW7w6E2Q
0xa3b1dcae43f38a3bdb0ab45daa3c12de5e7c3c79  XNM     32560                       33505                       945                         4E9YVB14xXjMj7n66YENkQ37gR2ekGxSrHbnP6TkHxXo
0xa3b1dcae43f38a3bdb0ab45daa3c12de5e7c3c79  XUNI    5786                        6006                        220                         4E9YVB14xXjMj7n66YENkQ37gR2ekGxSrHbnP6TkHxXo
0xad7d6ea90e8da4d759ee397c4d31e3df8ad10e6c  XNM     159442.5                    185600                      26157.5                     3kBxG6m3TJqPsrjjDGt3U9PGjPqBDJFQ4S95qH5GBPDd
0xad7d6ea90e8da4d759ee397c4d31e3df8ad10e6c  XBLK    43                          52                          9                           3kBxG6m3TJqPsrjjDGt3U9PGjPqBDJFQ4S95qH5GBPDd
0xad7d6ea90e8da4d759ee397c4d31e3df8ad10e6c  XUNI    46538                       55970                       9432                        3kBxG6m3TJqPsrjjDGt3U9PGjPqBDJFQ4S95qH5GBPDd
0x278787ed82d4b29552128f1e8301d345d3b2270a  XNM     883142.5                    898290                      15147.5                     8r1HfyppFJ1rqrr5PJqsJbdXZcYNfV8aNeZJCvtHrLvd
0x278787ed82d4b29552128f1e8301d345d3b2270a  XBLK    218                         226                         8                           8r1HfyppFJ1rqrr5PJqsJbdXZcYNfV8aNeZJCvtHrLvd
0x278787ed82d4b29552128f1e8301d345d3b2270a  XUNI    152534                      159494                      6960                        8r1HfyppFJ1rqrr5PJqsJbdXZcYNfV8aNeZJCvtHrLvd
0x1fda2e4e4c66c2e08b89eb55db89b857b76db0a8  XNM     110870                      117912.5                    7042.5                      GiXJhKMy2G5ZD6djLW21cLBkLZxJcRtbGmJuRhm2E95Y
0x1fda2e4e4c66c2e08b89eb55db89b857b76db0a8  XBLK    28                          31                          3                           GiXJhKMy2G5ZD6djLW21cLBkLZxJcRtbGmJuRhm2E95Y
0x1fda2e4e4c66c2e08b89eb55db89b857b76db0a8  XUNI    21970                       24206                       2236                        GiXJhKMy2G5ZD6djLW21cLBkLZxJcRtbGmJuRhm2E95Y
0xb22fbc18bfb88fcfc77e9efb5ba4f64d69b3ed2a  XNM     102382.5                    104527.5                    2145                        FeMwbYGXK13HcByyxETK5U6wNPuabcmpSdMsVuRh5pZ8
0xb22fbc18bfb88fcfc77e9efb5ba4f64d69b3ed2a  XBLK    26                          27                          1                           FeMwbYGXK13HcByyxETK5U6wNPuabcmpSdMsVuRh5pZ8
0xb22fbc18bfb88fcfc77e9efb5ba4f64d69b3ed2a  XUNI    27756                       28866                       1110                        FeMwbYGXK13HcByyxETK5U6wNPuabcmpSdMsVuRh5pZ8
0x6aef5c6b74c1b6ee1cac0e4dcfa73cf0d1eb4b06  XNM     174442.5                    193347.5                    18905                       FnCYp4J12ddoiGkjTJrXqF7e9WVyQ8pKuJLxVcXH54Mo
0x6aef5c6b74c1b6ee1cac0e4dcfa73cf0d1eb4b06  XBLK    47                          53                          6                           FnCYp4J12ddoiGkjTJrXqF7e9WVyQ8pKuJLxVcXH54Mo
0x6aef5c6b74c1b6ee1cac0e4dcfa73cf0d1eb4b06  XUNI    44652                       51152                       6500                        FnCYp4J12ddoiGkjTJrXqF7e9WVyQ8pKuJLxVcXH54Mo
0x8d132b1786d91ba1c794b2b9e43c1ed309092b12  XNM     896760                      897687.5                    927.5                       HmkFQ9aNqLVau6iU8S3pbidEBy6WmysAQTzjV6wnSbMh
0x8d132b1786d91ba1c794b2b9e43c1ed309092b12  XUNI    161808                      163360                      1552                        HmkFQ9aNqLVau6iU8S3pbidEBy6WmysAQTzjV6wnSbMh
0x15e19ca32ad28c41b8f47f4efce7b76e1b786254  XNM     141847.5                    158477.5                    16630                       A1B4u1sUC3HCTPW4BQ7vCqGneSVzR69rp3yz8xCDGcyQ
0x15e19ca32ad28c41b8f47f4efce7b76e1b786254  XBLK    42                          48                          6                           A1B4u1sUC3HCTPW4BQ7vCqGneSVzR69rp3yz8xCDGcyQ
0x15e19ca32ad28c41b8f47f4efce7b76e1b786254  XUNI    42244                       48892                       6648                        A1B4u1sUC3HCTPW4BQ7vCqGneSVzR69rp3yz8xCDGcyQ
0x6c3d7f1de0786c5e0d65a7e2c233b72aa6c4fad4  XNM     105322.5                    115257.5                    9935                        7JqBxsE5P59kWkBFxuFaTFEw5qMrEFnHLzPLVTKAGLGF
0x6c3d7f1de0786c5e0d65a7e2c233b72aa6c4fad4  XBLK    26                          28                          2                           7JqBxsE5P59kWkBFxuFaTFEw5qMrEFnHLzPLVTKAGLGF
0x6c3d7f1de0786c5e0d65a7e2c233b72aa6c4fad4  XUNI    27148                       30304                       3156                        7JqBxsE5P59kWkBFxuFaTFEw5qMrEFnHLzPLVTKAGLGF
0x51a1ba8f2ffc44d12e80cfde3ab66f08f8e63be7  XNM     3470                        3920                        450                         4DPV5WHvk4TKh4U9FWqb2B5tMSdV7TyxSisMXrDGV73n
0x51a1ba8f2ffc44d12e80cfde3ab66f08f8e63be7  XBLK    1                           2                           1                           4DPV5WHvk4TKh4U9FWqb2B5tMSdV7TyxSisMXrDGV73n
0x51a1ba8f2ffc44d12e80cfde3ab66f08f8e63be7  XUNI    1232                        1432                        200                         4DPV5WHvk4TKh4U9FWqb2B5tMSdV7TyxSisMXrDGV73n
0x5a30c4d96e8f2a8e91bb4c0d25e2f2a91d52fa68  XNM     75630                       91032.5                     15402.5                     2oTX4p7K2EK6LN2YTbDC2pZ57psJM6LPnww7yoJB3tpY
0x5a30c4d96e8f2a8e91bb4c0d25e2f2a91d52fa68  XBLK    19                          23                          4                           2oTX4p7K2EK6LN2YTbDC2pZ57psJM6LPnww7yoJB3tpY
0x5a30c4d96e8f2a8e91bb4c0d25e2f2a91d52fa68  XUNI    14988                       18576                       3588                        2oTX4p7K2EK6LN2YTbDC2pZ57psJM6LPnww7yoJB3tpY
0x9d5b3db26c26fed4e64b62aabce6e22144aed3cf  XNM     51777.5                     62035                       10257.5                     3QjGsJUfmPBZnRFCXAYR87DvWb6EsMPUYgZaUm3oDQc4
0x9d5b3db26c26fed4e64b62aabce6e22144aed3cf  XBLK    15                          18                          3                           3QjGsJUfmPBZnRFCXAYR87DvWb6EsMPUYgZaUm3oDQc4
0x9d5b3db26c26fed4e64b62aabce6e22144aed3cf  XUNI    14058                       17254                       3196                        3QjGsJUfmPBZnRFCXAYR87DvWb6EsMPUYgZaUm3oDQc4
0x45f47b7b8440f4f3e7e10c6acf9f1ca02e34f8d8  XNM     17540                       20612.5                     3072.5                      2iMAFjcJxdV1JrSfFPmKHT5AvbZLi3rxAXrVHEdwWMmf
0x45f47b7b8440f4f3e7e10c6acf9f1ca02e34f8d8  XBLK    4                           5                           1                           2iMAFjcJxdV1JrSfFPmKHT5AvbZLi3rxAXrVHEdwWMmf
0x45f47b7b8440f4f3e7e10c6acf9f1ca02e34f8d8  XUNI    3774                        4607                        833                         2iMAFjcJxdV1JrSfFPmKHT5AvbZLi3rxAXrVHEdwWMmf
0x2ec70a9b8e0ed78bb085dc2c0e33e03b5e1068b0  XNM     74460                       81332.5                     6872.5                      3JYKBvg9w5R5Y51u6QrR3ppQV8PbY8Bdu5qhq8ZS93Ma
0x2ec70a9b8e0ed78bb085dc2c0e33e03b5e1068b0  XBLK    17                          19                          2                           3JYKBvg9w5R5Y51u6QrR3ppQV8PbY8Bdu5qhq8ZS93Ma
0x2ec70a9b8e0ed78bb085dc2c0e33e03b5e1068b0  XUNI    15084                       17074                       1990                        3JYKBvg9w5R5Y51u6QrR3ppQV8PbY8Bdu5qhq8ZS93Ma
0x30b80f27c7b55d1e8fba7be3e4ac80d3b3baedc4  XNM     47260                       56870                       9610                        5YQ4V5vT1WQFfgLhieTGdB7L4dH1dkBVYxc6ULYEGDik
0x30b80f27c7b55d1e8fba7be3e4ac80d3b3baedc4  XBLK    12                          14                          2                           5YQ4V5vT1WQFfgLhieTGdB7L4dH1dkBVYxc6ULYEGDik
0x30b80f27c7b55d1e8fba7be3e4ac80d3b3baedc4  XUNI    10640                       12982                       2342                        5YQ4V5vT1WQFfgLhieTGdB7L4dH1dkBVYxc6ULYEGDik
0x5ee2f47c43e32e5124e90ffdf700b1c22e909e96  XNM     155600                      162530                      6930                        3Rh3bNphtQvxiPFwouZJQjq4sJHBEGcJzh4Xb1xRMXJh
0x5ee2f47c43e32e5124e90ffdf700b1c22e909e96  XBLK    33                          36                          3                           3Rh3bNphtQvxiPFwouZJQjq4sJHBEGcJzh4Xb1xRMXJh
0x5ee2f47c43e32e5124e90ffdf700b1c22e909e96  XUNI    22974                       24556                       1582                        3Rh3bNphtQvxiPFwouZJQjq4sJHBEGcJzh4Xb1xRMXJh
0x39b0e53da1e1e2d7df6f25af8e60b543e6cdb7e2  XNM     244092.5                    252267.5                    8175                        4Q8Vgy6rDjhd9EqHMqV8oeE3tfABnQRaRDPJpxCGAY3c
0x39b0e53da1e1e2d7df6f25af8e60b543e6cdb7e2  XBLK    68                          72                          4                           4Q8Vgy6rDjhd9EqHMqV8oeE3tfABnQRaRDPJpxCGAY3c
0x39b0e53da1e1e2d7df6f25af8e60b543e6cdb7e2  XUNI    59254                       62966                       3712                        4Q8Vgy6rDjhd9EqHMqV8oeE3tfABnQRaRDPJpxCGAY3c
0xb37c5261ba0fc08a1baaa66b88a5aa28e2a3dbde  XNM     176467.5                    193010                      16542.5                     G5NkidG4KPyf9jPMPTsE3eUq4X3iHUKdmhMNhBVoeCCw
0xb37c5261ba0fc08a1baaa66b88a5aa28e2a3dbde  XBLK    52                          56                          4                           G5NkidG4KPyf9jPMPTsE3eUq4X3iHUKdmhMNhBVoeCCw
0xb37c5261ba0fc08a1baaa66b88a5aa28e2a3dbde  XUNI    44484                       50124                       5640                        G5NkidG4KPyf9jPMPTsE3eUq4X3iHUKdmhMNhBVoeCCw
0xa9e5eb0a3b17789f69d8fba2eba2d6f6de5bcf48  XNM     112582.5                    129005                      16422.5                     FBWUwjEhYiHbMwYwQD3TZ8CxZuQC9JZPnXXfhFajaDJG
0xa9e5eb0a3b17789f69d8fba2eba2d6f6de5bcf48  XBLK    30                          35                          5                           FBWUwjEhYiHbMwYwQD3TZ8CxZuQC9JZPnXXfhFajaDJG
0xa9e5eb0a3b17789f69d8fba2eba2d6f6de5bcf48  XUNI    22736                       27002                       4266                        FBWUwjEhYiHbMwYwQD3TZ8CxZuQC9JZPnXXfhFajaDJG
0xfc2d1db1be3c17b4592e0c4843e0c83de16f35c7  XNM     63607.5                     70427.5                     6820                        AjZ2TfnA7x3oYy3NXLMY3U3W3FNjXy5XWD3KxhGsDdZN
0xfc2d1db1be3c17b4592e0c4843e0c83de16f35c7  XBLK    18                          22                          4                           AjZ2TfnA7x3oYy3NXLMY3U3W3FNjXy5XWD3KxhGsDdZN
0xfc2d1db1be3c17b4592e0c4843e0c83de16f35c7  XUNI    17682                       20276                       2594                        AjZ2TfnA7x3oYy3NXLMY3U3W3FNjXy5XWD3KxhGsDdZN
0xe8c12bcc9b2c3a71ad8462ba3cd8aac9f3ed29c1  XNM     225997.5                    236615                      10617.5                     J7PnFaKc7A2JZNedgcVLr3RZjjEKjXt8KzEJWr7HXZqp
0xe8c12bcc9b2c3a71ad8462ba3cd8aac9f3ed29c1  XBLK    55                          60                          5                           J7PnFaKc7A2JZNedgcVLr3RZjjEKjXt8KzEJWr7HXZqp
0xe8c12bcc9b2c3a71ad8462ba3cd8aac9f3ed29c1  XUNI    43296                       46570                       3274                        J7PnFaKc7A2JZNedgcVLr3RZjjEKjXt8KzEJWr7HXZqp
0x10c40e4a8bd7905bbafe49c27ae9ff0e1fcf4a4a  XNM     254590                      275405                      20815                       3RhYMtQQTaVkEDpB72kgXJ9sdzRMCHwVYHU7Yfk2pCit
0x10c40e4a8bd7905bbafe49c27ae9ff0e1fcf4a4a  XBLK    69                          75                          6                           3RhYMtQQTaVkEDpB72kgXJ9sdzRMCHwVYHU7Yfk2pCit
0x10c40e4a8bd7905bbafe49c27ae9ff0e1fcf4a4a  XUNI    78264                       87460                       9196                        3RhYMtQQTaVkEDpB72kgXJ9sdzRMCHwVYHU7Yfk2pCit
0xe1d99aa71f7c79a99a082f3cb02cb92d2b9d6f5c  XNM     79257.5                     80512.5                     1255                        7dJf22CRHbxUjuZ3NZkBp7e3A6gZ3Xfe7uPGz7j94Qkn
0xe1d99aa71f7c79a99a082f3cb02cb92d2b9d6f5c  XUNI    15060                       15580                       520                         7dJf22CRHbxUjuZ3NZkBp7e3A6gZ3Xfe7uPGz7j94Qkn
0xc5c0ff36a4e52497b64e5a3e0a46f34b6e6cd8c8  XNM     116695                      117950                      1255                        DwTdSaKUfYBmmGsU3mMdNhsnp5CiLp5X1E9x3Gnd9fEp
0xc5c0ff36a4e52497b64e5a3e0a46f34b6e6cd8c8  XBLK    31                          31                          0                           DwTdSaKUfYBmmGsU3mMdNhsnp5CiLp5X1E9x3Gnd9fEp
0xc5c0ff36a4e52497b64e5a3e0a46f34b6e6cd8c8  XUNI    25036                       25706                       670                         DwTdSaKUfYBmmGsU3mMdNhsnp5CiLp5X1E9x3Gnd9fEp
0x53a4dd42f0f55e97cba76614a11a8ea1cbef6a8f  XNM     63245                       65835                       2590                        5CbAPHxV4JjxhHbXhKGTJaH3eKf1j2Sj1JQrRcFAxjdA
0x53a4dd42f0f55e97cba76614a11a8ea1cbef6a8f  XBLK    15                          16                          1                           5CbAPHxV4JjxhHbXhKGTJaH3eKf1j2Sj1JQrRcFAxjdA
0x53a4dd42f0f55e97cba76614a11a8ea1cbef6a8f  XUNI    10730                       11504                       774                         5CbAPHxV4JjxhHbXhKGTJaH3eKf1j2Sj1JQrRcFAxjdA
0xd30c14a660e06b56b4bd5f41f0ac8aabd96bb77e  XNM     64157.5                     73462.5                     9305                        53Gr2F7bz2LjSJaGFdXHhkJH4qXLAFHbVCi3VBDhDVsb
0xd30c14a660e06b56b4bd5f41f0ac8aabd96bb77e  XBLK    16                          19                          3                           53Gr2F7bz2LjSJaGFdXHhkJH4qXLAFHbVCi3VBDhDVsb
0xd30c14a660e06b56b4bd5f41f0ac8aabd96bb77e  XUNI    14470                       16932                       2462                        53Gr2F7bz2LjSJaGFdXHhkJH4qXLAFHbVCi3VBDhDVsb
0x2d5c6d6b5e2a0dfc2f7a4f7b8ae7da1b9d87b4c1  XNM     169912.5                    181250                      11337.5                     7p1gVpHkJXuZkfBqNLmnC1bqQqMk4KhYMKb5J2B9FCNi
0x2d5c6d6b5e2a0dfc2f7a4f7b8ae7da1b9d87b4c1  XBLK    38                          44                          6                           7p1gVpHkJXuZkfBqNLmnC1bqQqMk4KhYMKb5J2B9FCNi
0x2d5c6d6b5e2a0dfc2f7a4f7b8ae7da1b9d87b4c1  XUNI    24528                       27220                       2692                        7p1gVpHkJXuZkfBqNLmnC1bqQqMk4KhYMKb5J2B9FCNi
0x0df5f66015caac13a1804c1c8e7dece5b3ddd88d  XNM     25160                       26935                       1775                        3kQm4fVLhZVSjPAHLnPBsCj7NnMoFUCX2wBZVPTXfWZL
0x0df5f66015caac13a1804c1c8e7dece5b3ddd88d  XBLK    7                           8                           1                           3kQm4fVLhZVSjPAHLnPBsCj7NnMoFUCX2wBZVPTXfWZL
0x0df5f66015caac13a1804c1c8e7dece5b3ddd88d  XUNI    7336                        8099                        763                         3kQm4fVLhZVSjPAHLnPBsCj7NnMoFUCX2wBZVPTXfWZL
0x8e7f0b93449b3ca10aa765b0bb16e62c5a0e5ce1  XNM     96897.5                     103340                      6442.5                      4DX41WJMFKrSHhsGafxYfhLxJRSUXdSiUhPjpZp9WBt6
0x8e7f0b93449b3ca10aa765b0bb16e62c5a0e5ce1  XBLK    23                          26                          3                           4DX41WJMFKrSHhsGafxYfhLxJRSUXdSiUhPjpZp9WBt6
0x8e7f0b93449b3ca10aa765b0bb16e62c5a0e5ce1  XUNI    19730                       21730                       2000                        4DX41WJMFKrSHhsGafxYfhLxJRSUXdSiUhPjpZp9WBt6
0xd9fae992761262c111904758a15378c3553255b9  XNM     977312.5                    977367.5                    55                          FtMJdVMkyRyFdKbQU7ZUCWhAR5DhwW9McgQ1tK6kpPoe
0xd9fae992761262c111904758a15378c3553255b9  XUNI    158738                      159470                      732                         FtMJdVMkyRyFdKbQU7ZUCWhAR5DhwW9McgQ1tK6kpPoe
0x0c62e55aeece5a155f76be75f741e15e7e3c7458  XNM     4207.5                      4697.5                      490                         8VmYUXopXSwcWQxL7C7kmrU7v2mXsjBvFAqLqjmcBNr7
0x0c62e55aeece5a155f76be75f741e15e7e3c7458  XUNI    1210                        1388                        178                         8VmYUXopXSwcWQxL7C7kmrU7v2mXsjBvFAqLqjmcBNr7
0x74b3bd3e64ec8cf0c3ad2ddbb84ddbf25eb6d28a  XNM     135600                      136665                      1065                        4yKVAe27o2wdjnAC1BFQPjMnLTfKsBMYnQP4KVm4Lj3S
0x74b3bd3e64ec8cf0c3ad2ddbb84ddbf25eb6d28a  XUNI    27228                       27742                       514                         4yKVAe27o2wdjnAC1BFQPjMnLTfKsBMYnQP4KVm4Lj3S
0x6fbb2c0d0ed4f0c08c97a3b06fa6c3d6dc22f7b8  XNM     85305                       86785                       1480                        5pYsmUKFLXBkwDvv2uo3A4sAZF9WLT9j8L1aFa1ZyFNi
0x6fbb2c0d0ed4f0c08c97a3b06fa6c3d6dc22f7b8  XBLK    22                          23                          1                           5pYsmUKFLXBkwDvv2uo3A4sAZF9WLT9j8L1aFa1ZyFNi
0x6fbb2c0d0ed4f0c08c97a3b06fa6c3d6dc22f7b8  XUNI    17622                       18214                       592                         5pYsmUKFLXBkwDvv2uo3A4sAZF9WLT9j8L1aFa1ZyFNi
0xb4f5d54f96ace28a6ed421cd2524b4a478ee5c0e  XNM     149882.5                    159445                      9562.5                      GmK5yCaSSHDuQWaPcfVzTLm93Zf9qJRLrsPKuJnwzBbQ
0xb4f5d54f96ace28a6ed421cd2524b4a478ee5c0e  XBLK    38                          41                          3                           GmK5yCaSSHDuQWaPcfVzTLm93Zf9qJRLrsPKuJnwzBbQ
0xb4f5d54f96ace28a6ed421cd2524b4a478ee5c0e  XUNI    19646                       21362                       1716                        GmK5yCaSSHDuQWaPcfVzTLm93Zf9qJRLrsPKuJnwzBbQ
0x99bc5f39c0571f1b8e8a87fbad00b9a5a5bcb105  XNM     81542.5                     92367.5                     10825                       3Xne1hBiUmB1KY1TiAVCCz4SSPqoAMF9ATxqtQbgFhqQ
0x99bc5f39c0571f1b8e8a87fbad00b9a5a5bcb105  XBLK    21                          25                          4                           3Xne1hBiUmB1KY1TiAVCCz4SSPqoAMF9ATxqtQbgFhqQ
0x99bc5f39c0571f1b8e8a87fbad00b9a5a5bcb105  XUNI    19440                       22610                       3170                        3Xne1hBiUmB1KY1TiAVCCz4SSPqoAMF9ATxqtQbgFhqQ
0x2f22dd82e9e9f06e59cd65c36e252f3cfa6f18c8  XNM     56637.5                     61462.5                     4825                        HhCa2eNxPsF9Qbz6nM72NqQGPVPtpFmS1gikRyLihVqr
0x2f22dd82e9e9f06e59cd65c36e252f3cfa6f18c8  XBLK    15                          17                          2                           HhCa2eNxPsF9Qbz6nM72NqQGPVPtpFmS1gikRyLihVqr
0x2f22dd82e9e9f06e59cd65c36e252f3cfa6f18c8  XUNI    15248                       16922                       1674                        HhCa2eNxPsF9Qbz6nM72NqQGPVPtpFmS1gikRyLihVqr
0xb1d5c5e3805c0a83ac8de78d35a69e4bb32adced  XNM     14280                       14810                       530                         9h2Bud1AEd3sJKhUQcYvXD7FhJNnkM3LknP7ccfKFDCi
0xb1d5c5e3805c0a83ac8de78d35a69e4bb32adced  XUNI    2688                        2862                        174                         9h2Bud1AEd3sJKhUQcYvXD7FhJNnkM3LknP7ccfKFDCi
0xa2be6b91abe37aab36cfab0e1e6efc47d8ba8c05  XNM     21322.5                     22200                       877.5                       6Dy4jVXqS8EVyj3LrBNHEDJh93vCHxTSGXGkAqJV6J63
0xa2be6b91abe37aab36cfab0e1e6efc47d8ba8c05  XUNI    4038                        4318                        280                         6Dy4jVXqS8EVyj3LrBNHEDJh93vCHxTSGXGkAqJV6J63
0x6f4e8e20c2e66aeab8adbe3a95aba49c00bf5bce  XNM     35830                       38470                       2640                        AUJg4Dej5KY7fxfMhBbyuM4Mbs7gRHT31bnXBj2YX1Ye
0x6f4e8e20c2e66aeab8adbe3a95aba49c00bf5bce  XBLK    10                          11                          1                           AUJg4Dej5KY7fxfMhBbyuM4Mbs7gRHT31bnXBj2YX1Ye
0x6f4e8e20c2e66aeab8adbe3a95aba49c00bf5bce  XUNI    7960                        8772                        812                         AUJg4Dej5KY7fxfMhBbyuM4Mbs7gRHT31bnXBj2YX1Ye
0xd39c9e4cf0eb4a9e6b1ee483c8ea54f71a28d7dd  XNM     56390                       57785                       1395                        52KiT8Cqj9aZUDDBg8HrGBffxPjkXPjVQxaAqF44m9gJ
0xd39c9e4cf0eb4a9e6b1ee483c8ea54f71a28d7dd  XBLK    13                          13                          0                           52KiT8Cqj9aZUDDBg8HrGBffxPjkXPjVQxaAqF44m9gJ
0xd39c9e4cf0eb4a9e6b1ee483c8ea54f71a28d7dd  XUNI    10040                       10458                       418                         52KiT8Cqj9aZUDDBg8HrGBffxPjkXPjVQxaAqF44m9gJ
0x6ab862b2dcb47acbb2d8d01c1ac0d47bd3bced8e  XNM     100810                      101605                      795                         9nCeMcj5EaGgVWC1d2Q2RccLGzRXvDP9G3WJNLWy7DAa
0x6ab862b2dcb47acbb2d8d01c1ac0d47bd3bced8e  XUNI    18256                       18714                       458                         9nCeMcj5EaGgVWC1d2Q2RccLGzRXvDP9G3WJNLWy7DAa
0xceda1e2dc7211035fbe4368706f0cdda8ba886e9  XNM     143092.5                    147177.5                    4085                        2jNhP1cJ8N9iGSzB831J9PsMxZpfrr9dkoaAHSqibHBu
0xceda1e2dc7211035fbe4368706f0cdda8ba886e9  XBLK    37                          38                          1                           2jNhP1cJ8N9iGSzB831J9PsMxZpfrr9dkoaAHSqibHBu
0xceda1e2dc7211035fbe4368706f0cdda8ba886e9  XUNI    16448                       17758                       1310                        2jNhP1cJ8N9iGSzB831J9PsMxZpfrr9dkoaAHSqibHBu
0x3ed962952c8c487348385d5bcaa44360daa2e0a0  XNM     50187.5                     57772.5                     7585                        AvqpEmGiEb7b3d27qvBH2h6o1jf9Gabcv4vjbkZkotUk
0x3ed962952c8c487348385d5bcaa44360daa2e0a0  XBLK    21                          25                          4                           AvqpEmGiEb7b3d27qvBH2h6o1jf9Gabcv4vjbkZkotUk
0x3ed962952c8c487348385d5bcaa44360daa2e0a0  XUNI    16209                       19266                       3057                        AvqpEmGiEb7b3d27qvBH2h6o1jf9Gabcv4vjbkZkotUk
0x6be4b1c5a91ca3a9ea6cc3550b5c440318ef109d  XNM     489522.5                    515472.5                    25950                       AcnLeovK7twb7mNqcH47WUeEfMEMF2EnQ2UyaLDFw2qZ
0x6be4b1c5a91ca3a9ea6cc3550b5c440318ef109d  XBLK    144                         152                         8                           AcnLeovK7twb7mNqcH47WUeEfMEMF2EnQ2UyaLDFw2qZ
0x6be4b1c5a91ca3a9ea6cc3550b5c440318ef109d  XUNI    128516                      139568                      11052                       AcnLeovK7twb7mNqcH47WUeEfMEMF2EnQ2UyaLDFw2qZ
0xe69554c8be7148897ac924468d412e596a468e58  XNM     425392.5                    428082.5                    2690                        H742uSstByzrD3NxyzJ4GMHkSoLkAcTLhap6kCdaVzJE
0xe69554c8be7148897ac924468d412e596a468e58  XUNI    95980                       97140                       1160                        H742uSstByzrD3NxyzJ4GMHkSoLkAcTLhap6kCdaVzJE
0xc700f118272de75400db1487d1e70996be620db2  XNM     244340                      257860                      13520                       EqijwyANTm8PhxDgEXAgP8yP6VYMEANdDsGdXrxAif4L
0xc700f118272de75400db1487d1e70996be620db2  XBLK    71                          74                          3                           EqijwyANTm8PhxDgEXAgP8yP6VYMEANdDsGdXrxAif4L
0xc700f118272de75400db1487d1e70996be620db2  XUNI    226688                      290327                      63639                       EqijwyANTm8PhxDgEXAgP8yP6VYMEANdDsGdXrxAif4L
```

SUMMARY:
```
API miners:        33928
On-chain records:  7739
Records in API but not on-chain: 26189
Records on-chain but not in API: 0
Overpayments found: 306
```

Note: "33928 API miners" includes miners without sol addresses due to a double `limit` param in the audit script URL. The actual count of miners with sol addresses is ~7,741.

---

## Diagnosis Methodology

1. **Audit script** (`src/audit.ts`): Fetched all API miners and all on-chain records, compared per-token amounts, flagged any case where `onChain > convertedApiAmount`
2. **Ruled out API duplicates**: Checked for duplicate ETH addresses in API response — found 0
3. **Ruled out conversion bugs**: Verified `convertApiAmountToTokenAmount` handles scientific notation correctly
4. **Checked on-chain run history**: Found Runs #21 and #22 started 7 seconds apart
5. **Correlated Run #22 recipients (114) with overpaid accounts (114)**: Exact match
6. **Verified totalAmount correlation**: Run #22's 2,859,584.5 tokens ≈ audit excess of 2,693,915.5 tokens (difference explained by continued mining)

---

## Remediation Required

### Immediate: Prevent recurrence

1. **Add run-level locking**: Before starting an airdrop, check if another run is currently in progress. Options:
   - On-chain lock flag in `GlobalState` (set at run start, cleared at run end)
   - File-based lock (`.airdrop.lock`) for single-machine deployments
   - Both, for defense in depth

2. **Re-fetch snapshots per batch or per recipient**: Instead of fetching all on-chain records once at the start, re-read the on-chain record for each recipient immediately before computing the delta. This makes the window for stale reads much smaller.

3. **Idempotent record updates**: Change `update_record_v2` from `checked_add` to an absolute-set semantic, where the caller passes the **target cumulative amount** instead of a delta. The program would reject updates where the new value is less than the current value (no going backwards), but would be safe against double-application.

### Future: Better record keeping

4. **Per-run recipient log**: Store which accounts were processed in each run (on-chain or off-chain) so that overlapping runs can be detected after the fact.

5. **Pre-flight overlap check**: Before processing, verify that no recipient in the current delta set was processed in the last N minutes.

6. **Audit integration**: Run the audit script (`src/audit.ts`) automatically after each airdrop run and log any discrepancies.

### Overpayment resolution

The 114 overpaid accounts have received more tokens than their API-entitled amounts. Options:
- Accept the overpayment as a one-time cost (total ~2.69M tokens across all three token types)
- Future airdrop runs will naturally "catch up" since the delta calculation will show 0 or negative for these accounts until their mining totals exceed the on-chain amounts
- No claw-back mechanism exists in the current program

---

## Lessons Learned

1. **Single-instance enforcement is critical for stateful batch operations.** The airdrop system reads global state, computes diffs, and writes updates — this is inherently non-concurrent-safe without locking.

2. **`checked_add` with deltas is not idempotent.** If the same delta is applied twice, the result is wrong. Absolute-set semantics would have caught this — the second run would have tried to set the same target value, resulting in a no-op rather than a double-add.

3. **The interval mode's last-run-date check is insufficient as a concurrency guard.** It prevents the *same process* from running too frequently, but doesn't prevent two separate processes from overlapping. The run is created at the beginning of execution, so two processes starting near-simultaneously both see the old last-run date.

4. **Audit tooling should be built alongside the system, not after incidents.** The audit script was created during this investigation; having it run automatically after each airdrop would have caught this immediately.
