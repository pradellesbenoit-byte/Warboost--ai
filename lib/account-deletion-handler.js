import {requireUser} from "./auth.js";
import {prepareAccountDeletion,deleteAccountData} from "./supabase.js";
import {createAccountDeletionHandler} from "./account-deletion.js";

export default createAccountDeletionHandler({requireUser,prepare:prepareAccountDeletion,remove:deleteAccountData});
