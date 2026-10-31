'use strict';
function classifyWorkError(status) {
  if (status === 404) return 'id_review';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'temporary_failure';
  return 'retrieval_failure';
}
module.exports = { classifyWorkError };
