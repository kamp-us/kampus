/**
 * @generated SignedSource<<ba568794c11d7f5819456cdc333f3a0e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryCreateStoryMutation$variables = {
  description?: string | null | undefined;
  tagIds?: ReadonlyArray<string> | null | undefined;
  title: string;
  url: string;
};
export type LibraryCreateStoryMutation$data = {
  readonly createStory: {
    readonly story: {
      readonly id: string;
      readonly " $fragmentSpreads": FragmentRefs<"Library_story">;
    } | null | undefined;
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
  "name": "description"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "tagIds"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "title"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "url"
},
v4 = [
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
v5 = {
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
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "LibraryCreateStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
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
              (v5/*: any*/),
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "Library_story"
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
      (v3/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "LibraryCreateStoryMutation",
    "selections": [
      {
        "alias": null,
        "args": (v4/*: any*/),
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
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "1833b1d0120df2f395b02cbf640a3b34",
    "id": null,
    "metadata": {},
    "name": "LibraryCreateStoryMutation",
    "operationKind": "mutation",
    "text": "mutation LibraryCreateStoryMutation(\n  $url: String!\n  $title: String!\n  $description: String\n  $tagIds: [String!]\n) {\n  createStory(url: $url, title: $title, description: $description, tagIds: $tagIds) {\n    story {\n      id\n      ...Library_story\n    }\n  }\n}\n\nfragment Library_story on Story {\n  id\n  url\n  title\n  description\n  createdAt\n  tags {\n    id\n    name\n    color\n  }\n}\n"
  }
};
})();

(node as any).hash = "3f8aeab836db22b06eed1b95174a7255";

export default node;
