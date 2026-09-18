
lint:
	npx @redocly/cli lint index.yaml

test:
	npm test

actionlint:
	go run github.com/rhysd/actionlint/cmd/actionlint@latest
