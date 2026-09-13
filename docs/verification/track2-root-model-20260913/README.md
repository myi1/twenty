# Clean current-engine root transition model — inactive

Parent7fa6d2b1 on7719e54f only. No spike ancestry or codeport. This is pure planning code over actual Person assignedAgentId/assignedAt/slaBreachedAt/slaWarnedAt fields, assignmentVersion andlastFence. No module/controller registration, databasewrite, stagedschema orenrollment.

Native Node24 tests7/7: ownerchange/pool/same-owner no-op/currentclocks, actualsafeNUMBER bounds/fence, malformedstoredclock refusal, supportedepoch+eligibleowner checks and pureversionsequence7→11. Dedicated-file strict TypeScript check passes. Tests do not authenticate realactors, exercise actualPerson or commitreceipts/events, orprovewritefences/projections. The caller mustholdroot/versionlocks andresolveactiveactor/eligibleowner insideactualtransaction. Replaylookup mustprecede new-intent transition; modelneverreconstructs oldreceipts fromcurrentowner.

No engine boot/heavytest wasrun; desk slotremains required. Prior fullengine typecheck has six matchingbaseline TS2742 errors, and lintneeds localrulepluginbuild; those nativegates remainincomplete, notwaived. NativeNode emits MODULE_TYPELESS_PACKAGE_JSON warning becauseenginepackage isCommonJS; do notchangeglobalmoduletype tosilencepuretestwarning.

Next: governed scopedwritefence+actualqueryRunner dependency/commit services, fullphysicalCheckC, protectedimmutableevent/intents, actualauth/sessionandprojection integrations andrealrootgolden matrix. Noengineimage build authorizedfrom spikehistory; thiscleanbranchisstillnot activation-ready. verified: neither
