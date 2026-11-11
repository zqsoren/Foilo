"""Metadata for the single widget action in the standalone Command Line Tools build.

CLT does not ship Xcode's appintentsmetadataprocessor. Keep this small schema
limited to this intent's required String parameters and verify its type symbol.
"""
import json
from pathlib import Path
import re
import subprocess
import sys

module = "XipoTodoWidget"
name = "CompleteWidgetTaskIntent"
source = Path("mac/XipoTodo/Widget/TodayWidget.swift").read_text()
fields = re.findall(r'@Parameter\(title: "([^"]+)"\) var (\w+): String', source)
assert [field for _, field in fields] == ["eventID", "occurrenceDate", "date", "context", "status"]
resources = Path(sys.argv[1])
binary = resources.parent / "MacOS" / module
symbols = subprocess.check_output(["/usr/bin/nm", str(binary)], text=True)
candidates = re.findall(r'_\$s(\S*Complete\S*V)Ma$', symbols, re.MULTILINE)
assert len(candidates) == 1
mangled = candidates[0]
description = subprocess.check_output(["xcrun", "swift-demangle", "--compact", "$s" + mangled + "Ma"], text=True)
assert module + "." + name in description
localized = lambda text: {"alternatives": [], "key": text}
parameters = [{"capabilities": 0, "dynamicOptionsSupport": 0, "inputConnectionBehavior": 0,
               "isInput": False, "isOptional": False, "name": field,
               "title": localized(title), "resolvableInputTypes": [], "typeSpecificMetadata": [],
               "valueType": {"primitive": {"wrapper": {"typeIdentifier": 0}}}}
              for title, field in fields]
action = {"identifier": name, "fullyQualifiedTypeName": module + "." + name,
          "mangledTypeName": mangled, "mangledTypeNameV2": mangled,
          "mangledTypeNameByBundleIdentifier": {}, "mangledTypeNameByBundleIdentifierV2": {},
          "title": localized("完成日程"), "parameters": parameters, "outputFlags": 0,
          "openAppWhenRun": False, "supportedModes": 1, "presentationStyle": 0,
          "authenticationPolicy": 0, "isAuthPolExplicit": False, "isDiscoverable": False,
          "visibilityMetadata": {"assistantOnly": False, "isDiscoverable": False},
          "availabilityAnnotations": {"LNPlatformNameWildcard": {"introducedVersion": "*"}},
          "effectiveBundleIdentifiers": [], "requiredCapabilities": [], "systemProtocols": [],
          "systemProtocolMetadata": [], "systemProtocolMetadataV2": [], "typeSpecificMetadata": [],
          "assistantDefinedSchemas": [], "assistantDefinedSchemaTraits": []}
metadata = {"version": 1, "generator": {"name": "xipo-cli", "version": "1"},
            "actions": {name: action}, "entities": {}, "enums": [], "queries": {},
            "assistantEntities": [], "assistantIntentNegativePhrases": [], "assistantIntents": [],
            "autoShortcuts": [], "negativePhrases": [], "shortcutTileColor": 0}
target = resources / "Metadata.appintents"
target.mkdir(parents=True, exist_ok=True)
(target / "extract.actionsdata").write_text(json.dumps(metadata, ensure_ascii=False))
(target / "version.json").write_text(json.dumps({"version": "3.0", "toolsVersion": "xipo-cli-1"}))
