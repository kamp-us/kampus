#!/usr/bin/env bun

// Start bluebun to run the correct CLI command
require("bluebun").run({
	name: "kampus",
	cliPath: require("node:path").join(__dirname, "../"),
});
