#include "node_config_file.h"
#include "env-inl.h"
#include "simdjson.h"
#include "util.h"
#include "uv.h"

namespace node {

using v8::NewStringType;
using v8::String;

std::optional<std::string> ConfigFile::GetPathFromArgs(
     const std::vector<std::string>& args) {
   std::string_view flag = "--config-file";
   // Match the last `--config-file`
   // This is required to imitate the default behavior of Node.js CLI argument
   // matching.
   auto path =
       std::find_if(args.rbegin(), args.rend(), [&flag](const std::string& arg) {
         return strncmp(arg.c_str(), flag.data(), flag.size()) == 0;
       });

   if (path == args.rend()) {
     return std::nullopt;
   }

   auto equal_char = path->find('=');

   if (equal_char != std::string::npos) {
     return path->substr(equal_char + 1);
   }

   auto next_arg = std::prev(path);

   if (next_arg == args.rend()) {
     return std::nullopt;
   }

   return *next_arg;
 }

bool ConfigFile::ParsePath(const std::string_view path) {
  std::string raw_file;
  if (ReadFileSync(&raw_file, path.data()) < 0) {
    // Loading file failed.
    // TODO(@anonrig): Throw appropiate error.
    return false;
  }

  simdjson::ondemand::parser parser;
  simdjson::ondemand::document document;
  simdjson::ondemand::object main_object;
  auto error = parser.iterate(raw_file).get(main_object);

  if (error || document.get_object().get(main_object)) {
    return false;
  }

  simdjson::ondemand::value ondemand_value;
  simdjson::ondemand::raw_json_string raw_json_string;
  std::string_view key;
  std::string_view value;

  // Config file schema is kept up to date on doc/node-config-schema.json
  for (auto field : main_object) {
    if (field.key().get(raw_json_string) || field.value().get(ondemand_value)) {
      return false;
    }

    if (key == "inspect") {
      // Implement the rest.
    }
  }

  return true;
}

void ConfigFile::AssignNodeOptionsIfAvailable(std::string* node_options) {
  // TODO(@anonrig): Implement this.
}

void ConfigFile::SetEnvironment(Environment* env) {
  // TODO(@anonrig): Implement this.
}

}  // namespace node
