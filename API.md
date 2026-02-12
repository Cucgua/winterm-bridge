# IDEA Context Server API 文档

**Base URL:** `http://127.0.0.1:63888`（端口可在设置中修改，范围 1024-65535）

**协议:** HTTP / JSON

**CORS:** 默认全开放（`anyHost()`），支持通过设置指定允许的 Origins

**允许方法:** `GET`、`OPTIONS`

---

## 接口列表

### 1. 健康检查

```
GET /api/health
```

检查服务器是否正常运行。

#### 请求参数

无。

#### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `string` | 服务状态，固定值 `"ok"` |
| `version` | `string` | 插件版本，固定值 `"1.0.0"` |

#### 示例

```bash
curl http://127.0.0.1:63888/api/health
```

```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

---

### 2. 获取 IDE 上下文

```
GET /api/context
```

获取当前 IDE 中所有打开项目的上下文信息，包括项目信息、打开的文件列表、以及光标所在的函数。

#### 请求参数

无。

#### 响应字段

**顶层结构 — `ContextData`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `projects` | `ProjectContext[]` | 所有打开的项目上下文列表（排除默认项目） |

**`ProjectContext`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | `ProjectInfo` | 项目基本信息 |
| `openFiles` | `FileInfo[]` | 该项目中打开的文件列表（可通过设置关闭） |
| `currentFunction` | `FunctionInfo \| null` | 光标当前所在的函数信息（可通过设置关闭） |

**`ProjectInfo`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 项目名称 |
| `basePath` | `string` | 项目根目录路径（启用 WSL 模式时自动转换格式） |

**`FileInfo`**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `string` | — | 文件名 |
| `path` | `string` | — | 文件完整路径 |
| `isActive` | `boolean` | `false` | 是否为当前激活（选中）的文件 |

**`FunctionInfo`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 函数/方法名 |
| `signature` | `string` | 函数签名（函数声明的第一行） |
| `className` | `string \| null` | 所属类名（无类则为 `null`） |
| `filePath` | `string` | 函数所在文件的完整路径 |
| `lineNumber` | `int` | 函数声明所在行号（从 1 开始） |
| `language` | `string` | 编程语言名称 |

#### 支持的语言

函数识别通过 IntelliJ PSI 类名匹配实现，当前支持：

| 语言 | PSI 类 |
|------|--------|
| Java | `PsiMethodImpl` / `PsiMethod` |
| Kotlin | `KtNamedFunction` |
| Python | `PyFunction` / `PyFunctionImpl` |
| Go | `GoFunctionDeclaration` / `GoMethodDeclaration` |
| JavaScript | `JSFunction` |
| TypeScript | `TypeScriptFunction` |

#### 示例

```bash
curl http://127.0.0.1:63888/api/context
```

```json
{
  "projects": [
    {
      "project": {
        "name": "my-project",
        "basePath": "/mnt/d/gitproject/my-project"
      },
      "openFiles": [
        {
          "name": "Main.kt",
          "path": "/mnt/d/gitproject/my-project/src/Main.kt",
          "isActive": true
        },
        {
          "name": "Utils.kt",
          "path": "/mnt/d/gitproject/my-project/src/Utils.kt",
          "isActive": false
        }
      ],
      "currentFunction": {
        "name": "processData",
        "signature": "fun processData(input: String): Result",
        "className": "DataProcessor",
        "filePath": "/mnt/d/gitproject/my-project/src/Main.kt",
        "lineNumber": 42,
        "language": "Kotlin"
      }
    }
  ]
}
```

---

## 可配置项

以下设置影响接口行为，可在 **Settings > Tools > IDEA Context Server** 中修改：

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否启用 HTTP 服务器 |
| `host` | `string` | `127.0.0.1` | 绑定的主机地址 |
| `port` | `int` | `63888` | 监听端口 |
| `corsOrigins` | `string` | `*` | 允许的 CORS 来源，逗号分隔；空或 `*` 表示全放开 |
| `wslPathFormat` | `boolean` | `false` | 是否将 Windows 路径转为 WSL 格式（`C:\foo` → `/mnt/c/foo`） |
| `exposeProject` | `boolean` | `true` | 是否暴露项目信息 |
| `exposeOpenFiles` | `boolean` | `true` | 是否暴露打开的文件列表 |
| `exposeCurrentFunction` | `boolean` | `true` | 是否暴露当前光标所在函数 |

> **注意：** 当 `exposeOpenFiles` 为 `false` 时，`openFiles` 返回空数组；当 `exposeCurrentFunction` 为 `false` 时，`currentFunction` 返回 `null`。
