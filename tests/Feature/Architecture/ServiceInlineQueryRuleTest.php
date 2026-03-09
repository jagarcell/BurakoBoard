<?php

namespace Tests\Feature\Architecture;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Tests\TestCase;

class ServiceInlineQueryRuleTest extends TestCase
{
    /**
     * Ensure service classes do not contain inline database queries.
     *
     * The test scans PHP files under app/Services and fails when common
     * query patterns (DB facade query methods or direct model query calls)
     * are detected in service code.
     *
     * @return void
     */
    public function test_services_do_not_contain_inline_queries(): void
    {
        $servicesPath = app_path('Services');

        if (! is_dir($servicesPath)) {
            $this->assertTrue(true);

            return;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($servicesPath)
        );

        $forbiddenPatterns = [
            'DB facade query call' => '/\bDB::\s*(table|select|insert|update|delete|statement|unprepared)\s*\(/',
            'Direct model query call' => '/\b[A-Z][A-Za-z0-9_\\\\]*::\s*(query|where|find|findOrFail|first|firstOrFail|create|update|delete|destroy|insert|upsert|select|get|all|paginate|simplePaginate|cursor|count|sum|avg|max|min|pluck|value|exists|doesntExist)\s*\(/',
        ];

        $violations = [];

        foreach ($iterator as $fileInfo) {
            if (! $fileInfo->isFile() || $fileInfo->getExtension() !== 'php') {
                continue;
            }

            $source = file_get_contents($fileInfo->getPathname()) ?: '';
            $tokens = token_get_all($source);
            $code = '';

            foreach ($tokens as $token) {
                if (! is_array($token)) {
                    $code .= $token;

                    continue;
                }

                if (in_array($token[0], [T_COMMENT, T_DOC_COMMENT, T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)) {
                    continue;
                }

                $code .= $token[1];
            }

            foreach ($forbiddenPatterns as $label => $pattern) {
                if (preg_match($pattern, $code) === 1) {
                    $violations[] = sprintf('%s: %s', $label, $fileInfo->getPathname());
                }
            }
        }

        $this->assertSame(
            [],
            $violations,
            "Inline queries detected in service classes:\n".implode("\n", $violations)
        );
    }
}
