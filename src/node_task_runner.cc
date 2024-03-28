#include "node_task_runner.h"
#include "node_process-inl.h"
#include "util-inl.h"
#include "simdjson.h"

namespace node {
namespace task_runner {

void RunTask(std::unique_ptr<InitializationResultImpl>& result, std::string_view cwd, std::vector<std::string> argv) {
  std::string_view path = "package.json";

  printf("ExperimentalWarning: Task runner is an experimental feature and might change at any time\n");

  std::string raw_content;

  if (ReadFileSync(&raw_content, path.data()) < 0) {
    printf("Can't read package.json\n");
    return;
  }

  simdjson::ondemand::parser json_parser;
  simdjson::ondemand::document document;
  simdjson::ondemand::object main_object;
  simdjson::error_code error = json_parser.iterate(raw_content).get(document);

  if (error || document.get_object().get(main_object)) {
    printf("Can't parse package.json\n");
    result->exit_code_ = ExitCode::kGenericUserError;
    return;
  }

  simdjson::ondemand::object scripts_object;
  if (main_object.find_field("scripts").get_object().get(scripts_object)) {
    printf("Can't read package.json \"scripts\" object\n");
    result->exit_code_ = ExitCode::kGenericUserError;
    return;
  }

  std::string id = argv.at(2);
  // Remove the first two arguments, which are the node binary and the command "run"
  // and the id.
  argv.erase(argv.begin(), argv.begin() + 2);

  std::string_view command_to_execute;

  error = scripts_object.find_field(id).get_string().get(command_to_execute);
  if (error) {
    // TODO(@anonrig): Print all fields in here.
    result->exit_code_ = ExitCode::kGenericUserError;
    return;
  }
}


} // namespace task_runner
} // namespace node

