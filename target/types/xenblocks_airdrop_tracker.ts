/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/xenblocks_airdrop_tracker.json`.
 */
export type XenblocksAirdropTracker = {
  "address": "xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv",
  "metadata": {
    "name": "xenblocksAirdropTracker",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain airdrop tracking program for Xenblocks tokens"
  },
  "instructions": [
    {
      "name": "acquireLock",
      "docs": [
        "Acquire the airdrop lock (or override if expired)"
      ],
      "discriminator": [
        101,
        3,
        93,
        16,
        193,
        193,
        148,
        175
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "timeoutSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "createRunV2",
      "docs": [
        "Create a new airdrop run (V2 with per-token totals)"
      ],
      "discriminator": [
        26,
        236,
        217,
        25,
        54,
        95,
        138,
        75
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "airdropRun",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dryRun",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initializeAndUpdateV2",
      "docs": [
        "Initialize a record and immediately set amounts (for new wallets during airdrop)"
      ],
      "discriminator": [
        11,
        96,
        49,
        240,
        7,
        7,
        185,
        214
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "airdropRecord",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ethAddress",
          "type": {
            "array": [
              "u8",
              42
            ]
          }
        },
        {
          "name": "xnmAmount",
          "type": "u64"
        },
        {
          "name": "xblkAmount",
          "type": "u64"
        },
        {
          "name": "xuniAmount",
          "type": "u64"
        },
        {
          "name": "nativeAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeLock",
      "docs": [
        "Initialize the airdrop lock PDA (one-time setup)"
      ],
      "discriminator": [
        182,
        214,
        195,
        105,
        58,
        73,
        81,
        124
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeRecordV2",
      "docs": [
        "Initialize a new airdrop record keyed by ETH address"
      ],
      "discriminator": [
        9,
        168,
        75,
        31,
        120,
        164,
        180,
        40
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "airdropRecord",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ethAddress",
          "type": {
            "array": [
              "u8",
              42
            ]
          }
        }
      ]
    },
    {
      "name": "initializeStateV2",
      "docs": [
        "Initialize the global state V2 PDA (one-time setup)"
      ],
      "discriminator": [
        50,
        88,
        153,
        218,
        18,
        3,
        245,
        107
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "releaseLock",
      "docs": [
        "Release the airdrop lock (holder only)"
      ],
      "discriminator": [
        241,
        251,
        248,
        8,
        198,
        190,
        195,
        6
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "lock",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  99,
                  107
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "updateAuthority",
      "docs": [
        "Transfer authority to a new public key (current authority only)"
      ],
      "discriminator": [
        32,
        46,
        64,
        28,
        149,
        75,
        243,
        88
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateRecordV2",
      "docs": [
        "Update an existing airdrop record after a successful transfer"
      ],
      "discriminator": [
        128,
        80,
        71,
        187,
        243,
        5,
        79,
        128
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "airdropRecord",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "xnmAmount",
          "type": "u64"
        },
        {
          "name": "xblkAmount",
          "type": "u64"
        },
        {
          "name": "xuniAmount",
          "type": "u64"
        },
        {
          "name": "nativeAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateRunTotalsV2",
      "docs": [
        "Update run totals after completion (V2 with per-token amounts)"
      ],
      "discriminator": [
        188,
        197,
        94,
        210,
        219,
        102,
        141,
        240
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "state",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  50
                ]
              }
            ]
          }
        },
        {
          "name": "airdropRun",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  117,
                  110,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "account",
                "path": "airdrop_run.run_id",
                "account": "airdropRunV2"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "totalRecipients",
          "type": "u32"
        },
        {
          "name": "totalAmount",
          "type": "u64"
        },
        {
          "name": "totalXnmAmount",
          "type": "u64"
        },
        {
          "name": "totalXblkAmount",
          "type": "u64"
        },
        {
          "name": "totalXuniAmount",
          "type": "u64"
        },
        {
          "name": "totalNativeAmount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "airdropLock",
      "discriminator": [
        90,
        243,
        247,
        96,
        76,
        217,
        120,
        216
      ]
    },
    {
      "name": "airdropRecordV2",
      "discriminator": [
        246,
        23,
        150,
        93,
        132,
        249,
        155,
        7
      ]
    },
    {
      "name": "airdropRunV2",
      "discriminator": [
        127,
        201,
        150,
        176,
        20,
        89,
        56,
        68
      ]
    },
    {
      "name": "globalStateV2",
      "discriminator": [
        244,
        133,
        94,
        157,
        48,
        192,
        238,
        52
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "overflow",
      "msg": "Arithmetic overflow when updating total"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not the authority"
    },
    {
      "code": 6002,
      "name": "lockHeld",
      "msg": "Lock is currently held by another process"
    },
    {
      "code": 6003,
      "name": "invalidTimeout",
      "msg": "Invalid timeout: must be between 60 and 3600 seconds"
    },
    {
      "code": 6004,
      "name": "lockNotHeld",
      "msg": "Lock is not held by the caller"
    }
  ],
  "types": [
    {
      "name": "airdropLock",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lockHolder",
            "docs": [
              "Public key of the current lock holder"
            ],
            "type": "pubkey"
          },
          {
            "name": "lockedAt",
            "docs": [
              "Unix timestamp when the lock was acquired"
            ],
            "type": "i64"
          },
          {
            "name": "timeoutSeconds",
            "docs": [
              "Lock timeout duration in seconds"
            ],
            "type": "i64"
          },
          {
            "name": "runId",
            "docs": [
              "Associated run ID (set after create_run for audit trail)"
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "airdropRecordV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ethAddress",
            "docs": [
              "The associated ETH address (as UTF-8 bytes, e.g., \"0x1234...\")"
            ],
            "type": {
              "array": [
                "u8",
                42
              ]
            }
          },
          {
            "name": "xnmAirdropped",
            "docs": [
              "Cumulative XNM amount airdropped (in token base units, 9 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "xblkAirdropped",
            "docs": [
              "Cumulative XBLK amount airdropped (in token base units, 9 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "xuniAirdropped",
            "docs": [
              "Cumulative XUNI amount airdropped (in token base units, 9 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "nativeAirdropped",
            "docs": [
              "Cumulative native token (XNT) airdropped (in lamports, 9 decimals)"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved space for future use (8 bytes each * 4 = 32 bytes)"
            ],
            "type": {
              "array": [
                "u64",
                4
              ]
            }
          },
          {
            "name": "lastUpdated",
            "docs": [
              "Unix timestamp of last update"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed for derivation"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "airdropRunV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "Schema version (set to 1)"
            ],
            "type": "u8"
          },
          {
            "name": "runId",
            "docs": [
              "Unique run ID"
            ],
            "type": "u64"
          },
          {
            "name": "runDate",
            "docs": [
              "Unix timestamp when run started"
            ],
            "type": "i64"
          },
          {
            "name": "totalRecipients",
            "docs": [
              "Number of successful recipients"
            ],
            "type": "u32"
          },
          {
            "name": "totalAmount",
            "docs": [
              "Total combined amount airdropped (preserved from v1)"
            ],
            "type": "u64"
          },
          {
            "name": "totalXnmAmount",
            "docs": [
              "Total XNM amount airdropped"
            ],
            "type": "u64"
          },
          {
            "name": "totalXblkAmount",
            "docs": [
              "Total XBLK amount airdropped"
            ],
            "type": "u64"
          },
          {
            "name": "totalXuniAmount",
            "docs": [
              "Total XUNI amount airdropped"
            ],
            "type": "u64"
          },
          {
            "name": "totalNativeAmount",
            "docs": [
              "Total native (XNT) amount airdropped"
            ],
            "type": "u64"
          },
          {
            "name": "dryRun",
            "docs": [
              "Whether this was a dry run"
            ],
            "type": "bool"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved space for future use"
            ],
            "type": {
              "array": [
                "u64",
                4
              ]
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "globalStateV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "Schema version (set to 1)"
            ],
            "type": "u8"
          },
          {
            "name": "authority",
            "docs": [
              "Authority who can create runs and update records"
            ],
            "type": "pubkey"
          },
          {
            "name": "runCounter",
            "docs": [
              "Counter for run IDs"
            ],
            "type": "u64"
          },
          {
            "name": "xnmAirdropped",
            "docs": [
              "Cumulative XNM airdropped across all records"
            ],
            "type": "u64"
          },
          {
            "name": "xblkAirdropped",
            "docs": [
              "Cumulative XBLK airdropped across all records"
            ],
            "type": "u64"
          },
          {
            "name": "xuniAirdropped",
            "docs": [
              "Cumulative XUNI airdropped across all records"
            ],
            "type": "u64"
          },
          {
            "name": "nativeAirdropped",
            "docs": [
              "Cumulative native (XNT) airdropped across all records"
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Reserved space for future use"
            ],
            "type": {
              "array": [
                "u64",
                4
              ]
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
