/**
 * @generated SignedSource<<02dbb533b75ffe675637c3ac864f7f1c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryCreateStoryMutation$variables = {
  connections: ReadonlyArray<string>;
  description?: string | null | undefined;
  tagIds?: ReadonlyArray<string> | null | undefined;
  title: string;
  url: string;
};
export type LibraryCreateStoryMutation$data = {
  readonly createStory: {
    readonly story: {
      readonly " $fragmentSpreads": FragmentRefs<"LibraryStoryFragment">;
    };
  };
};
export type LibraryCreateStoryMutation = {
  response: LibraryCreateStoryMutation$data;
  variables: LibraryCreateStoryMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "connections"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "tagIds"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "title"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "url"
},
v5 = [
  {
    "kind": "Variable",
    "name": "description",
    "variableName": "description"
  },
  {
    "kind": "Variable",
    "name": "tagIds",
    "variableName": "tagIds"
  },
  {
    "kind": "Variable",
    "name": "title",
    "variableName": "title"
  },
  {
    "kind": "Variable",
    "name": "url",
    "variableName": "url"
  }
],
v6 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryCreateStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
        "concreteType": "CreateStoryPayload",
        "kind": "LinkedField",
        "name": "createStory",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Story",
            "kind": "LinkedField",
            "name": "story",
            "plural": false,
            "selections": [
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "LibraryStoryFragment"
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v4/*: any*/),
      (v3/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryCreateStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v5/*: any*/),
        "concreteType": "CreateStoryPayload",
        "kind": "LinkedField",
        "name": "createStory",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Story",
            "kind": "LinkedField",
            "name": "story",
            "plural": false,
            "selections": [
              (v6/*: any*/),
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "url",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "title",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "description",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "createdAt",
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "Tag",
                "kind": "LinkedField",
                "name": "tags",
                "plural": true,
                "selections": [
                  (v6/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "name",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "color",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "filters": null,
            "handle": "prependNode",
            "key": "",
            "kind": "LinkedHandle",
            "name": "story",
            "handleArgs": [
              {
                "kind": "Variable",
                "name": "connections",
                "variableName": "connections"
              },
              {
                "kind": "Literal",
                "name": "edgeTypeName",
                "value": "StoryEdge"
              }
            ]
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "c1681ad0ef702d3fbe1e811258a842b1",
    "id": null,
    "metadata": {},
    "name": "LibraryCreateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryCreateStoryMutation(\n  $url: String!\n  $title: String!\n  $description: String\n  $tagIds: [String!]\n) {\n  createStory(url: $url, title: $title, description: $description, tagIds: $tagIds) {\n    story {\n      ...LibraryStoryFragment\n      id\n    }\n  }\n}\n\nfragment LibraryStoryFragment on Story {\n  id\n  url\n  title\n  description\n  createdAt\n  tags {\n    id\n    name\n    color\n  }\n}\n"
  }
};
})();

(node as any).hash = "4d879e7b32291fd58c4eaa09c4d46fa3";

export default node;
