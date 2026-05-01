# Strength-agent Project Structure

## Root

- .agents/: 已导入技能（第三方与通用能力）
- .continue/: Continue 使用的技能镜像
- \_references/: 外部仓库参考
- skills/: 本地核心技能目录（统一入口）
- fitness-agent-requirements-analysis.md: 需求分析主文档
- mvp-development-plan.md: MVP 开发计划
- skills-lock.json: skills 工具锁文件

## Skills Directory Convention

- 每个技能独立目录
- 必有 SKILL.md
- 目录名与 frontmatter name 保持一致
- 引用路径统一写为 Strength-agent/skills/<skill>/SKILL.md 或 Strength-agent/.agents/skills/<skill>/SKILL.md

## Current Local Skills

- awesome-design-md-guide
- coach-bot-ops
- context-analyzer
- documentation-specialist
- find-skills
- fitness-agent-orchestrator
- llm-cost-control-governor
- requirement-analysis-workflow
- todo-manager
- training-periodization-engine
