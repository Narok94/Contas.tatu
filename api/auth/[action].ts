import { authMutationHandler } from '../../server/auth/router.js';
// One deployed function serves both existing URLs; session.ts remains separate.
export default authMutationHandler();
