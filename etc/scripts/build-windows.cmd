
@echo "Cleaning build env"
del /S /Q dist

@echo "Installing deps"
cmd.exe /c npm i

@echo running package
npm run package