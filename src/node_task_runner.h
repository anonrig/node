#ifndef NODE_TASK_RUNNER_H
#define NODE_TASK_RUNNER_H

#include "env-inl.h"

#include <string_view>

namespace node {
namespace task_runner {

void RunTask(std::unique_ptr<InitializationResultImpl>& result,
             std::string_view cwd,
             std::vector<std::string> argv);

} // namespace task_runner
} // namespace node


#endif  // NODE_TASK_RUNNER_H
