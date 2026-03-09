<?php

namespace Tests\Feature\Architecture;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Tests\TestCase;

class PhpDocBlockRuleTest extends TestCase
{
    /**
     * Ensure targeted PHP layers use complete docblocks for named functions.
     *
     * @return void
     * Logic: scan API/service/repository files and fail when a named function is missing a docblock, @return, Logic:, or needed @param tags.
     */
    public function test_targeted_php_functions_have_complete_docblocks(): void
    {
        $paths = [
            app_path('Services'),
            app_path('Repositories'),
            app_path('Http/Controllers/Api'),
            app_path('Http/Requests/Api'),
            app_path('Http/Resources/Api'),
        ];

        $violations = [];

        foreach ($paths as $path) {
            if (! is_dir($path)) {
                continue;
            }

            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($path)
            );

            foreach ($iterator as $fileInfo) {
                if (! $fileInfo->isFile() || $fileInfo->getExtension() !== 'php') {
                    continue;
                }

                $this->collectFileViolations($fileInfo->getPathname(), $violations);
            }
        }

        $this->assertSame(
            [],
            $violations,
            "Docblock rule violations:\n".implode("\n", $violations)
        );
    }

    /**
     * Parse one PHP file and append docblock violations.
     *
     * @param  string  $filePath  Absolute file path to inspect.
     * @param  array<int, string>  $violations  Mutable violation list collector.
     * @return void
     * Logic: tokenize file contents, locate named functions, and validate required docblock elements against parameter presence.
     */
    private function collectFileViolations(string $filePath, array &$violations): void
    {
        $source = file_get_contents($filePath) ?: '';
        $tokens = token_get_all($source);
        $tokenCount = count($tokens);

        for ($i = 0; $i < $tokenCount; $i++) {
            $token = $tokens[$i];

            if (! is_array($token) || $token[0] !== T_FUNCTION) {
                continue;
            }

            $functionNameIndex = $this->findFunctionNameIndex($tokens, $i + 1);

            if ($functionNameIndex === null) {
                continue;
            }

            $functionNameToken = $tokens[$functionNameIndex];
            $functionName = is_array($functionNameToken) ? $functionNameToken[1] : 'unknown';
            $line = is_array($functionNameToken) ? $functionNameToken[2] : 0;
            $paramCount = $this->countFunctionParameters($tokens, $functionNameIndex + 1);

            $docComment = $this->findNearestDocComment($tokens, $i - 1);

            if ($docComment === null) {
                $violations[] = sprintf('%s:%d %s is missing a docblock.', $filePath, $line, $functionName);

                continue;
            }

            $hasReturnTag = preg_match('/@return\b/', $docComment) === 1;
            $hasLogicLine = preg_match('/\bLogic:/i', $docComment) === 1;
            $hasParamTag = preg_match('/@param\b/', $docComment) === 1;

            if (! $hasReturnTag) {
                $violations[] = sprintf('%s:%d %s docblock is missing @return.', $filePath, $line, $functionName);
            }

            if (! $hasLogicLine) {
                $violations[] = sprintf('%s:%d %s docblock is missing Logic:.', $filePath, $line, $functionName);
            }

            if ($paramCount > 0 && ! $hasParamTag) {
                $violations[] = sprintf('%s:%d %s has parameters but docblock is missing @param.', $filePath, $line, $functionName);
            }
        }
    }

    /**
     * Find the index of a named function token after a T_FUNCTION token.
     *
     * @param  array<int, mixed>  $tokens  Tokenized PHP source.
     * @param  int  $startIndex  Scan start index.
     * @return int|null Token index of the function name or null for anonymous functions.
     * Logic: skip modifiers and whitespace until first significant token, returning T_STRING names and ignoring closures.
     */
    private function findFunctionNameIndex(array $tokens, int $startIndex): ?int
    {
        $tokenCount = count($tokens);

        for ($i = $startIndex; $i < $tokenCount; $i++) {
            $token = $tokens[$i];

            if (! is_array($token)) {
                if ($token === '(') {
                    return null;
                }

                continue;
            }

            if ($token[0] === T_WHITESPACE) {
                continue;
            }

            if ($token[0] === T_STRING) {
                return $i;
            }

        }

        return null;
    }

    /**
     * Count function parameters by scanning variable tokens in the signature.
     *
     * @param  array<int, mixed>  $tokens  Tokenized PHP source.
     * @param  int  $startIndex  Index at or after the function name.
     * @return int Number of parameters in the signature.
     * Logic: locate signature parentheses and count top-level variable tokens that represent declared parameters.
     */
    private function countFunctionParameters(array $tokens, int $startIndex): int
    {
        $tokenCount = count($tokens);
        $openParenIndex = null;

        for ($i = $startIndex; $i < $tokenCount; $i++) {
            if ($tokens[$i] === '(') {
                $openParenIndex = $i;
                break;
            }
        }

        if ($openParenIndex === null) {
            return 0;
        }

        $depth = 0;
        $params = 0;

        for ($i = $openParenIndex; $i < $tokenCount; $i++) {
            $token = $tokens[$i];

            if ($token === '(') {
                $depth++;
                continue;
            }

            if ($token === ')') {
                $depth--;

                if ($depth === 0) {
                    break;
                }

                continue;
            }

            if ($depth === 1 && is_array($token) && $token[0] === T_VARIABLE) {
                $params++;
            }
        }

        return $params;
    }

    /**
     * Find the nearest doc comment token before a function declaration.
     *
     * @param  array<int, mixed>  $tokens  Tokenized PHP source.
     * @param  int  $startIndex  Index before the function token.
     * @return string|null Doc comment contents or null.
     * Logic: walk backward over whitespace/attributes and return the closest T_DOC_COMMENT when present.
     */
    private function findNearestDocComment(array $tokens, int $startIndex): ?string
    {
        $ignorableTokenIds = [
            T_WHITESPACE,
            T_PUBLIC,
            T_PROTECTED,
            T_PRIVATE,
            T_STATIC,
            T_ABSTRACT,
            T_FINAL,
            T_READONLY,
        ];

        if (defined('T_ATTRIBUTE')) {
            $ignorableTokenIds[] = T_ATTRIBUTE;
        }

        for ($i = $startIndex; $i >= 0; $i--) {
            $token = $tokens[$i];

            if (! is_array($token)) {
                if (trim($token) === '') {
                    continue;
                }

                return null;
            }

            if (in_array($token[0], $ignorableTokenIds, true)) {
                continue;
            }

            if ($token[0] === T_DOC_COMMENT) {
                return $token[1];
            }

            return null;
        }

        return null;
    }
}
