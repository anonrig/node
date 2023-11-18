#ifndef SRC_NODE_CONFIG_FILE_H_
#define SRC_NODE_CONFIG_FILE_H_

#if defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#include "util-inl.h"

#include <optional>
#include <map>

namespace node {

class ConfigFile {
 public:
  ConfigFile() = default;
  ConfigFile(const ConfigFile& d) = default;
  ConfigFile(ConfigFile&& d) noexcept = default;
  ConfigFile& operator=(ConfigFile&& d) noexcept = default;
  ConfigFile& operator=(const ConfigFile& d) = default;
  ~ConfigFile() = default;

  bool ParsePath(const std::string_view path);
  void AssignNodeOptionsIfAvailable(std::string* node_options);
  void SetEnvironment(Environment* env);

  static std::optional<std::string> GetPathFromArgs(
       const std::vector<std::string>& args);
};

}  // namespace node

#endif  // defined(NODE_WANT_INTERNALS) && NODE_WANT_INTERNALS

#endif  // SRC_NODE_CONFIG_FILE_H_
