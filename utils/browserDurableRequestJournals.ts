import {createGoalRequestJournal} from './goalRequestJournal';
import {serializeBrowserRequestJournal} from './browserRequestJournalLock';
import {createBrowserEncryptedJournalStorage,browserJournalDigest,browserJournalGeneration} from './browserEncryptedJournalStorage';
export function createBrowserGoalRequestJournal(project:string){return serializeBrowserRequestJournal(createGoalRequestJournal({project,storage:createBrowserEncryptedJournalStorage(project,'accepted_goal_v1'),digest:browserJournalDigest,newGeneration:browserJournalGeneration}),'accepted_goal_v1');}
