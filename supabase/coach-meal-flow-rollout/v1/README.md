# Coach saved meal flow listing — v1

Reviewed SQL retained outside automatic migrations, following the existing rollout-package convention. These are exact reviewed install, read-only verify, and guarded rollback artifacts; committing this folder does not execute them.

The parent release verified installation and ai-coach v217 before this source reconciliation. The install deliberately refuses an existing helper; do not replay it on the installed database. Any verification or rollback requires coordinated review of current database state and the scripts' guards. No table or schema grants are introduced.
