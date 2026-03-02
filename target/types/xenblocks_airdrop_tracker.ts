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
      "name": "closeRecord",
      "docs": [
        "Close an airdrop record and reclaim rent (admin only)"
      ],
      "discriminator": [
        111,
        192,
        122,
        188,
        38,
        234,
        242,
        249
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "airdropRecord",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "closeRecordV2",
      "docs": [
        "Close a V2 airdrop record and reclaim rent (admin only)"
      ],
      "discriminator": [
        14,
        65,
        4,
        216,
        112,
        23,
        57,
        184
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
                  101
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
      "args": []
    },
    {
      "name": "createRun",
      "docs": [
        "Create a new airdrop run"
      ],
      "discriminator": [
        195,
        241,
        245,
        139,
        101,
        109,
        209,
        237
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
                  101
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
      "name": "initializeAndUpdate",
      "docs": [
        "Initialize a record and immediately update it (for new wallets during airdrop)",
        "Sets all three token amounts plus native amount at once"
      ],
      "discriminator": [
        110,
        48,
        174,
        47,
        71,
        105,
        223,
        39
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "solWallet"
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
      "name": "initializeAndUpdateV2",
      "docs": [
        "Initialize a V2 record and immediately set amounts (for new wallets during airdrop)"
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
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
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
      "name": "initializeRecord",
      "docs": [
        "Initialize a new airdrop record for a wallet/eth pair"
      ],
      "discriminator": [
        92,
        106,
        172,
        44,
        148,
        3,
        42,
        251
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "solWallet"
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
      "name": "initializeRecordV2",
      "docs": [
        "Initialize a new V2 airdrop record keyed by ETH address only"
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
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
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
      "name": "initializeState",
      "docs": [
        "Initialize the global state (one-time setup)"
      ],
      "discriminator": [
        190,
        171,
        224,
        219,
        217,
        72,
        199,
        176
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
                  101
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
      "name": "migrateRecord",
      "docs": [
        "Migrate a V1 airdrop record to V2 (ETH-only PDA)",
        "Copies all fields from old_record to new_record, then closes old_record.",
        "Accepts canonical (lowercased) ETH address for V2 PDA derivation so that",
        "mixed-case V1 records produce the same PDA the client expects."
      ],
      "discriminator": [
        11,
        152,
        11,
        75,
        10,
        158,
        213,
        126
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
                  101
                ]
              }
            ]
          }
        },
        {
          "name": "oldRecord",
          "writable": true
        },
        {
          "name": "newRecord",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "canonicalEth",
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
      "name": "updateRecord",
      "docs": [
        "Update an existing airdrop record after a successful transfer",
        "Updates all three token amounts plus native amount at once"
      ],
      "discriminator": [
        54,
        194,
        108,
        162,
        199,
        12,
        5,
        60
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
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
      "name": "updateRecordV2",
      "docs": [
        "Update an existing V2 airdrop record after a successful transfer"
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
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  101
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
      "name": "updateRunTotals",
      "docs": [
        "Update run totals after completion"
      ],
      "discriminator": [
        38,
        24,
        28,
        212,
        47,
        29,
        149,
        65
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
                  101
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
                  110
                ]
              },
              {
                "kind": "account",
                "path": "airdrop_run.run_id",
                "account": "airdropRun"
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
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "airdropRecord",
      "discriminator": [
        1,
        181,
        208,
        237,
        232,
        225,
        112,
        229
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
      "name": "airdropRun",
      "discriminator": [
        174,
        215,
        129,
        23,
        242,
        50,
        97,
        35
      ]
    },
    {
      "name": "globalState",
      "discriminator": [
        163,
        46,
        74,
        168,
        216,
        123,
        133,
        98
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
      "name": "ethAddressMismatch",
      "msg": "Canonical ETH address does not match lowercased old record"
    }
  ],
  "types": [
    {
      "name": "airdropRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "solWallet",
            "docs": [
              "The Solana wallet address that receives airdrops"
            ],
            "type": "pubkey"
          },
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
      "name": "airdropRun",
      "type": {
        "kind": "struct",
        "fields": [
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
              "Total amount airdropped (in token base units)"
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
      "name": "globalState",
      "type": {
        "kind": "struct",
        "fields": [
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
