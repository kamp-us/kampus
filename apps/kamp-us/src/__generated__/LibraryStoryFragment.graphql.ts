/**
 * @generated SignedSource<<85d46bb7c0a008b16e5d55be4ed0a0b2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type LibraryStoryFragment$data = {
  readonly createdAt: string;
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly " $fragmentType": "LibraryStoryFragment";
};
export type LibraryStoryFragment$key = {
  readonly " $data"?: LibraryStoryFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"LibraryStoryFragment">;
};

import LibraryStoryRefetchQuery_graphql from './LibraryStoryRefetchQuery.graphql';

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": {
    "refetch": {
      "connection": null,
      "fragmentPathInResult": [
        "node"
      ],
      "operation": LibraryStoryRefetchQuery_graphql,
      "identifierInfo": {
        "identifierField": "id",
        "identifierQueryVariableName": "id"
      }
    }
  },
  "name": "LibraryStoryFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
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
      "name": "createdAt",
      "storageKey": null
    }
  ],
  "type": "Story",
  "abstractKey": null
};

(node as any).hash = "e1df41c7bfa3f37f00a3f23d308d2941";

export default node;
