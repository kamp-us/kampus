/**
 * @generated SignedSource<<85b3b4596879ee25fe73c9d533e923c0>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryUpdateStoryMutation$variables = {
  description?: string | null | undefined;
  id: string;
  tagIds?: ReadonlyArray<string> | null | undefined;
  title?: string | null | undefined;
};
export type LibraryUpdateStoryMutation$data = {
  readonly updateStory: {
    readonly error: {
      readonly message: string;
    } | null | undefined;
    readonly story: {
      readonly id: string;
      readonly " $fragmentSpreads": FragmentRefs<"Library_story">;
    } | null | undefined;
  };
};
export type LibraryUpdateStoryMutation = {
  response: LibraryUpdateStoryMutation$data;
  variables: LibraryUpdateStoryMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "id"
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
v4 = [
  {
    "kind": "Variable",
    "name": "description",
    "variableName": "description"
  },
  {
    "kind": "Variable",
    "name": "id",
    "variableName": "id"
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
  }
],
v5 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v6 = {
  "alias": null,
  "args": null,
  "concreteType": "StoryNotFoundError",
  "kind": "LinkedField",
  "name": "error",
  "plural": false,
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "message",
      "storageKey": null
    }
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryUpdateStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
        "concreteType": "UpdateStoryPayload",
        "kind": "LinkedField",
        "name": "updateStory",
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
              (v5/*: any*/),
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "Library_story"
              }
            ],
            "storageKey": null
          },
          (v6/*: any*/)
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
      (v1/*: any*/),
      (v3/*: any*/),
      (v0/*: any*/),
      (v2/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryUpdateStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
        "concreteType": "UpdateStoryPayload",
        "kind": "LinkedField",
        "name": "updateStory",
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
              (v5/*: any*/),
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
                  (v5/*: any*/),
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
          (v6/*: any*/)
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "559e3ed66fbc137915a09a2442af15d2",
    "id": null,
    "metadata": {},
    "name": "LibraryUpdateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryUpdateStoryMutation(\n  $id: ID!\n  $title: String\n  $description: String\n  $tagIds: [ID!]\n) {\n  updateStory(id: $id, title: $title, description: $description, tagIds: $tagIds) {\n    story {\n      id\n      ...Library_story\n    }\n    error {\n      message\n    }\n  }\n}\n\nfragment Library_story on Story {\n  id\n  url\n  title\n  description\n  createdAt\n  tags {\n    id\n    name\n    color\n  }\n}\n"
  }
};
})();

(node as any).hash = "175a0739890af4d2d54e5ace31fc09ea";

export default node;
