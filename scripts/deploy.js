import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const deployBranch = 'deploy'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32' && command === 'npm.cmd',
  })

  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} завершилась с ошибкой.`)
  }
  return result
}

function git(args, options = {}) {
  return run('git', args, options)
}

function gitText(args, cwd = repoRoot) {
  return git(args, { cwd, capture: true }).stdout.trim()
}

async function getCommitMessage() {
  const provided = process.argv.slice(2).join(' ').trim()
  if (provided) return provided

  if (!process.stdin.isTTY) {
    throw new Error('Укажите сообщение: npm run deploy -- "Ваше сообщение"')
  }

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await prompt.question('Сообщение коммита: ')).trim()
    if (!answer) throw new Error('Сообщение коммита не может быть пустым.')
    return answer
  } finally {
    prompt.close()
  }
}

function getPagesBasePath() {
  const remote = gitText(['remote', 'get-url', 'origin'])
  const match = remote.match(/[:/]([^/:]+?)(?:\.git)?$/)
  if (!match) throw new Error(`Не удалось определить имя репозитория из origin: ${remote}`)
  return `/${match[1]}/`
}

async function copyBuildContents(source, destination) {
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    await fs.cp(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true })
  }
}

async function main() {
  const message = await getCommitMessage()
  const currentBranch = gitText(['branch', '--show-current'])
  if (currentBranch !== 'main') {
    throw new Error(`Переключитесь на ветку main перед публикацией (сейчас: ${currentBranch || 'detached HEAD'}).`)
  }

  git(['fetch', 'origin'])
  const mainIsBehind = git(['merge-base', '--is-ancestor', 'origin/main', 'main'], { allowFailure: true })
  if (mainIsBehind.status !== 0) {
    throw new Error('Локальная ветка main отстаёт или разошлась с origin/main. Сначала выполните git pull --rebase.')
  }

  git(['add', '--all'])
  const hasStagedChanges = git(['diff', '--cached', '--quiet'], { allowFailure: true }).status !== 0
  const mainAhead = gitText(['rev-list', '--count', 'origin/main..main']) !== '0'
  if (hasStagedChanges) {
    git(['commit', '-m', message])
  } else if (!mainAhead) {
    throw new Error('Нет изменений для коммита в main.')
  } else {
    console.log('Найдены локальные коммиты main, ещё не отправленные в GitHub; продолжу публикацию.')
  }

  const pagesBasePath = getPagesBasePath()
  const build = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    env: { ...process.env, PAGES_BASE_PATH: pagesBasePath, VITE_STATIC_DEMO: 'true' },
  })
  if (build.status !== 0) throw new Error('Сборка GitHub Pages не удалась.')

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aquastone-pages-'))
  const worktreePath = path.join(tempRoot, deployBranch)
  let worktreeAdded = false
  try {
    git(['worktree', 'add', worktreePath, deployBranch])
    worktreeAdded = true
    git(['rm', '-r', '--ignore-unmatch', '--', '.'], { cwd: worktreePath })
    await copyBuildContents(path.join(repoRoot, 'dist'), worktreePath)
    git(['add', '--all'], { cwd: worktreePath })
    git(['commit', '-m', message], { cwd: worktreePath })

    // Push both refs together, so a rejected update cannot publish only one branch.
    git(['push', '--atomic', 'origin', 'main', deployBranch])
    console.log('Готово: main и deploy отправлены в GitHub.')
  } finally {
    if (worktreeAdded) git(['worktree', 'remove', '--force', worktreePath])
    const resolvedRoot = path.resolve(tempRoot)
    const resolvedTemp = path.resolve(os.tmpdir())
    if (path.dirname(resolvedRoot) !== resolvedTemp || !path.basename(resolvedRoot).startsWith('aquastone-pages-')) {
      throw new Error(`Отмена очистки: временный каталог вне ожидаемого места (${resolvedRoot}).`)
    }
    await fs.rm(resolvedRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`\nПубликация остановлена: ${error.message}`)
  process.exitCode = 1
})
