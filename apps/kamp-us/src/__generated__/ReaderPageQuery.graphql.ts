/**
 * @generated SignedSource<<feedd22b0413662be7a24a84826e37ec>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type ReaderPageQuery$variables = {
  storyId: string;
};
export type ReaderPageQuery$data = {
  readonly me: {
    readonly library: {
      readonly story: {
        readonly id: string;
        readonly readerContent: {
          readonly content: {
            readonly byline: string | null | undefined;
            readonly content: string;
            readonly readingTimeMinutes: number;
            readonly siteName: string | null | undefined;
            readonly title: string;
            readonly wordCount: number;
          } | null | undefined;
          readonly error: string | null | undefined;
          readonly readable: boolean;
        };
        readonly title: string;
        readonly url: string;
      } | null | undefined;
    };
  } | null | undefined;
};
export type ReaderPageQuery = {
  response: ReaderPageQuery$data;
  variables: ReaderPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "storyId"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "title",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": [
    {
      "kind": "Variable",
      "name": "id",
      "variableName": "storyId"
    }
  ],
  "concreteType": "Story",
  "kind": "LinkedField",
  "name": "story",
  "plural": false,
  "selections": [
    (v1/*: any*/),
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "url",
      "storageKey": null
    },
    (v2/*: any*/),
    {
      "alias": null,
      "args": null,
      "concreteType": "ReaderResult",
      "kind": "LinkedField",
      "name": "readerContent",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "readable",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "error",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "ReaderContent",
          "kind": "LinkedField",
          "name": "content",
          "plural": false,
          "selections": [
            (v2/*: any*/),
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "content",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "byline",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "siteName",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "wordCount",
              "storageKey": null
            },
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "readingTimeMinutes",
              "storageKey": null
            }
          ],
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "ReaderPageQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "me",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Library",
            "kind": "LinkedField",
            "name": "library",
            "plural": false,
            "selections": [
              (v3/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "ReaderPageQuery",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "User",
        "kind": "LinkedField",
        "name": "me",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Library",
            "kind": "LinkedField",
            "name": "library",
            "plural": false,
            "selections": [
              (v3/*: any*/),
              (v1/*: any*/)
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "96c1430588ff6bf620de715fa935b55f",
    "id": null,
    "metadata": {},
    "name": "ReaderPageQuery",
    "operationKind": "query",
    "text": "query ReaderPageQuery(\n  $storyId: ID!\n) {\n  me {\n    library {\n      story(id: $storyId) {\n        id\n        url\n        title\n        readerContent {\n          readable\n          error\n          content {\n            title\n            content\n            byline\n            siteName\n            wordCount\n            readingTimeMinutes\n          }\n        }\n      }\n      id\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "8dd517b35d11037bafcbfa8f1feda1ed";

export default node;
