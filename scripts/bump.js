#!/usr/bin/env node
// @ts-check

const fs = require("fs");
const path = require("path");

const allowedTypes = ["patch", "minor", "major"];
const bumpType = process.argv[2];

if (!allowedTypes.includes(bumpType)) {
  console.error(`Usage: node bump.js [patch|minor|major]`);
  process.exit(1);
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function bumpVersion(version, type) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  let [major, minor, patch] = parts;
  if (type === "patch") {
    patch += 1;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else {
    return null;
  }
  return [major, minor, patch].join(".");
}

const pkgPath = path.resolve(__dirname, "../package.json");
const lockPath = path.resolve(__dirname, "../package-lock.json");
const manifestPath = path.resolve(__dirname, "../src/manifest.json");

// Update package.json
const pkg = readJSON(pkgPath);
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bumpType);

if (!newVersion) {
  console.error("Failed to bump version.");
  process.exit(1);
}

pkg.version = newVersion;
writeJSON(pkgPath, pkg);

// Update package-lock.json if exists
if (fs.existsSync(lockPath)) {
  const lock = readJSON(lockPath);
  lock.version = newVersion;
  writeJSON(lockPath, lock);
}

// Update manifest.json if exists
if (fs.existsSync(manifestPath)) {
  const manifest = readJSON(manifestPath);
  manifest.version = newVersion;
  writeJSON(manifestPath, manifest);
}

console.log(`Version bumped from ${oldVersion} to ${newVersion}`);
