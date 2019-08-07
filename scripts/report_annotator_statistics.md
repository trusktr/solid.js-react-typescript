# Statistics Report

We are gathering statistics on Annotator tool usage in a spreadsheet. To make some new stats you need:

- write access to [the spreadsheet](https://docs.google.com/spreadsheets/d/1uy5BURyJAVCHQOTaOaqMHjXEB-loqlRccw501Fbyp8c/edit?usp=sharing)
- a session ID which has been annotated and published
- the organization ID for the session
- [AWS CLI tools](https://docs.google.com/document/d/1x7yNMfRnDBJQt2FqrkDZyUa8a6w7KhgdqshYg4Au0sc/edit#)
- a build of [mapper-semantic-conversion](https://github.com/Signafy/mapper-semantic-conversion)
- `report_annotator_statistics.py`

You will probably want another script to pull it all together, like this example:

```
#!/bin/sh

ORGANIZATION_ID=fb1a22ff-5796-49f3-be8b-2aa311974872
SESSION_ID=EC9365000006_20181004-114824227

# report_annotator_statistics.py
PATH_TO_STATS_PY=/Users/clyde/dev/mapper/mapper-annotator/scripts/report_annotator_statistics.py

# mapper-semantic-conversion
PATH_TO_CONVERTER=/Users/clyde/dev/mapper/mapper-semantic-conversion/build/distributions/mapper-semantic-conversion-1.1.0/bin/mapper-semantic-conversion

# where you want your .tsv file to appear, for importing into spreadsheets
PATH_TO_HOME_DIR=/Users/clyde/Documents

python3 \
	$PATH_TO_STATS_PY \
	$PATH_TO_CONVERTER \
	$PATH_TO_HOME_DIR \
	$ORGANIZATION_ID \
	$SESSION_ID
```

After running the scripts, you are left with a `.tsv` file. Open [the spreadsheet](https://docs.google.com/spreadsheets/d/1uy5BURyJAVCHQOTaOaqMHjXEB-loqlRccw501Fbyp8c/edit?usp=sharing) and navigate to `File>Import…>Upload`. Drag the `.tsv` file there. Then select `Insert new sheet(s)` and `Import data`.

The new sheet has raw data but no calculations. Go to one of the existing sheets, copy the calculations rows (in green), and paste into the new sheet. Check the equations to be sure they refer to the correct cells in the new sheet.
