// netlify/functions/proxy.js - Netlify Function for GitHub Proxy

// 域名映射配置
const domain_mappings = {
  'github.com': 'nf-gh.',
  'avatars.githubusercontent.com': 'nf-avatars-githubusercontent-com.',
  'github.githubassets.com': 'nf-github-githubassets-com.',
  'collector.github.com': 'nf-collector-github-com.',
  'api.github.com': 'nf-api-github-com.',
  'raw.githubusercontent.com': 'nf-raw-githubusercontent-com.',
  'gist.githubusercontent.com': 'nf-gist-githubusercontent-com.',
  'github.io': 'nf-github-io.',
  'assets-cdn.github.com': 'nf-assets-cdn-github-com.',
  'cdn.jsdelivr.net': 'nf-cdn.jsdelivr-net.',
  'securitylab.github.com': 'nf-securitylab-github-com.',
  'www.githubstatus.com': 'nf-www-githubstatus-com.',
  'npmjs.com': 'nf-npmjs-com.',
  'git-lfs.github.com': 'nf-git-lfs-github-com.',
  'githubusercontent.com': 'nf-githubusercontent-com.',
  'github.global.ssl.fastly.net': 'nf-github-global-ssl-fastly-net.',
  'api.npms.io': 'nf-api-npms-io.',
  'github.community': 'nf-github-community.'
};

// 需要重定向的路径
const redirect_paths = ['/', '/login', '/signup', '/copilot'];

// 获取当前主机名的前缀，用于匹配反向映射
function getProxyPrefix(host) {
  // 检查主机名是否以 gh. 开头
  if (host.startsWith('gh.')) {
    return 'gh.';
  }
  
  // 检查其他映射前缀
  for (const prefix of Object.values(domain_mappings)) {
    if (host.startsWith(prefix)) {
      return prefix;
    }
  }
  
  return null;
}

async function modifyResponse(response, host_prefix, effective_hostname) {
  // 只处理文本内容
  const content_type = response.headers.get('content-type') || '';
  if (!content_type.includes('text/') && !content_type.includes('application/json') && 
      !content_type.includes('application/javascript') && !content_type.includes('application/xml')) {
    return response.body;
  }

  let text = await response.text();
  
  // 使用有效主机名获取域名后缀部分（用于构建完整的代理域名）
  const domain_suffix = effective_hostname.substring(host_prefix.length);
  
  // 替换所有域名引用
  for (const [original_domain, proxy_prefix] of Object.entries(domain_mappings)) {
    const escaped_domain = original_domain.replace(/\./g, '\\.');
    const full_proxy_domain = `${proxy_prefix}${domain_suffix}`;
    
    // 替换完整URLs
    text = text.replace(
      new RegExp(`https?://${escaped_domain}(?=/|"|'|\\s|$)`, 'g'),
      `https://${full_proxy_domain}`
    );
    
    // 替换协议相对URLs
    text = text.replace(
      new RegExp(`//${escaped_domain}(?=/|"|'|\\s|$)`, 'g'),
      `//${full_proxy_domain}`
    );
  }

  // 处理相对路径，使用有效主机名
  if (host_prefix === 'gh.') {
    text = text.replace(
      /(?<=["'])\/(?!\/|[a-zA-Z]+:)/g,
      `https://${effective_hostname}/`
    );
  }

  return text;
}

// 修改响应内容
async function modifyResponse(response, host_prefix, effective_hostname) {
  // 只处理文本内容
  const content_type = response.headers.get('content-type') || '';
  if (!content_type.includes('text/') && 
      !content_type.includes('application/json') && 
      !content_type.includes('application/javascript') && 
      !content_type.includes('application/xml')) {
    // 对于非文本内容，直接返回原始数据
    return response.body;
  }

  let text = await response.text();
  
  // 使用有效主机名获取域名后缀部分（用于构建完整的代理域名）
  const domain_suffix = effective_hostname.substring(host_prefix.length);
  
  // 替换所有域名引用
  for (const [original_domain, proxy_prefix] of Object.entries(domain_mappings)) {
    const escaped_domain = original_domain.replace(/\./g, '\\.');
    const full_proxy_domain = `${proxy_prefix}${domain_suffix}`;
    
    // 替换完整URLs
    text = text.replace(
      new RegExp(`https?://${escaped_domain}(?=/|"|'|\\s|$)`, 'g'),
      `https://${full_proxy_domain}`
    );
    
    // 替换协议相对URLs
    text = text.replace(
      new RegExp(`//${escaped_domain}(?=/|"|'|\\s|$)`, 'g'),
      `//${full_proxy_domain}`
    );
  }

  // 处理相对路径
  if (host_prefix === 'gh.') {
    text = text.replace(
      /(?<=["'])\/(?!\/|[a-zA-Z]+:)/g,
      `https://${effective_hostname}/`
    );
  }

  return text;
}

// Netlify Function handler
exports.handler = async function(event, context) {
  console.warn('[Debug] 收到请求:', {
    path: event.path,
    httpMethod: event.httpMethod,
    headers: event.headers,
    queryStringParameters: event.queryStringParameters
  });

  const request = event;
  const url = new URL(request.rawUrl || `https://${request.headers.host}${request.path}`);
  const current_host = url.host;
  
  console.warn('[Debug] 解析的 URL:', {
    raw: request.rawUrl,
    parsed: url.toString(),
    host: current_host
  });
  
  // 检测Host头，优先使用Host头中的域名来决定后缀
  const host_header = request.headers.host;
  const effective_host = host_header || current_host;
  
  console.warn('[Debug] 主机名信息:', {
    host_header,
    effective_host
  });
  
  // 创建模拟的响应对象
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    setHeader: function(name, value) {
      if (!this.headers) this.headers = {};
      this.headers[name] = value;
    },
    send: function(body) {
      return {
        statusCode: this.statusCode || 200,
        headers: this.headers || {},
        body: typeof body === 'string' ? body : JSON.stringify(body)
      };
    },
    json: function(body) {
      if (!this.headers) this.headers = {};
      this.headers['Content-Type'] = 'application/json';
      return {
        statusCode: this.statusCode || 200,
        headers: this.headers,
        body: JSON.stringify(body)
      };
    },
    end: function() {
      return {
        statusCode: this.statusCode || 200,
        headers: this.headers || {}
      };
    }
  };
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const current_host = req.headers.host || url.host;
    
    // 检测Host头，优先使用Host头中的域名来决定后缀
    const effective_host = req.headers.host || current_host;
    
    // 处理 OPTIONS 请求（CORS 预检）
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }
    
    // 检查特殊路径重定向
    if (redirect_paths.includes(url.pathname)) {
      res.setHeader('Location', 'https://www.gov.cn');
      return res.status(302).end();
    }

    // 从有效主机名中提取前缀
    console.warn('[Debug] 当前请求主机名:', effective_host);
    const host_prefix = getProxyPrefix(effective_host);
    console.warn('[Debug] 提取的前缀:', {
      effective_host,
      host_prefix
    });
    
    if (!host_prefix) {
      console.warn('[Debug] 未找到匹配的前缀配置');
      return res.status(404).send('Domain not configured for proxy');
    }

    // 根据前缀找到对应的原始域名
    let target_host = null;
    for (const [original, prefix] of Object.entries(domain_mappings)) {
      console.warn('[Debug] 检查映射:', original, '->', prefix);
      if (prefix === host_prefix) {
        target_host = original;
        console.warn('[Debug] 找到目标主机:', target_host);
        break;
      }
    }
    
    console.warn('[Debug] 目标主机解析:', {
      host_prefix,
      target_host,
      domain_mappings: Object.entries(domain_mappings)
        .filter(([original, prefix]) => prefix === host_prefix)
    });

    if (!target_host) {
      console.warn('[Debug] 未找到匹配的目标主机');
      return res.status(404).send('Domain not configured for proxy');
    }

    // 直接使用正则表达式处理最常见的嵌套URL问题
    let pathname = url.pathname;
    console.warn('[Debug] 处理前的路径:', pathname);
    
    // 修复特定的嵌套URL模式 - 直接移除嵌套URL部分
    const original_pathname = pathname;
    pathname = pathname.replace(/(\/[^\/]+\/[^\/]+\/(?:latest-commit|tree-commit-info)\/[^\/]+)\/https%3A\/\/[^\/]+\/.*/, '$1');
     pathname = pathname.replace(/(\/[^\/]+\/[^\/]+\/(?:latest-commit|tree-commit-info)\/[^\/]+)\/https:\/\/[^\/]+\/.*/, '$1');

    console.warn('[Debug] 路径处理:', {
      original: original_pathname,
      processed: pathname,
      changed: original_pathname !== pathname
    });

    // 构建新的请求URL
    const new_url = new URL(`https://${target_host}${pathname}${url.search}`);

    // 设置新的请求头
    const new_headers = new Headers();
    
    // 复制原始请求头，但过滤掉一些特定的头
    const headers_to_skip = ['host', 'connection', 'cf-', 'x-forwarded-', 'x-nf-'];
    for (const [key, value] of Object.entries(req.headers)) {
      const lower_key = key.toLowerCase();
      if (!headers_to_skip.some(skip => lower_key.startsWith(skip))) {
        new_headers.set(key, value);
      }
    }
    
    new_headers.set('Host', target_host);
    new_headers.set('Referer', new_url.href);
    
    // 准备请求选项
    const fetchOptions = {
      method: req.method,
      headers: new_headers,
      redirect: 'manual'  // 手动处理重定向
    };

    // 处理请求体
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const bodyChunks = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk);
      }
      if (bodyChunks.length > 0) {
        fetchOptions.body = Buffer.concat(bodyChunks);
      }
    }

    // 发起请求
    console.warn('[Debug] 发送请求到:', new_url.href);
    console.warn('[Debug] 请求头:', JSON.stringify(Object.fromEntries(new_headers.entries()), null, 2));
    
    let fetchOptions = {
      method: request.method,
      headers: new_headers
    };

    // 只有非 GET 请求才设置 body
    if (request.method !== 'GET' && request.body) {
      fetchOptions.body = request.body;
    }

    try {
      const response = await fetch(new_url.href, fetchOptions);
      console.warn('[Debug] 响应状态:', response.status);
      console.warn('[Debug] 响应头:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      // 克隆响应以便处理内容
      const response_clone = response.clone();
      
      // 设置新的响应头
      const new_response_headers = new Headers(response.headers);
      new_response_headers.set('access-control-allow-origin', '*');
      new_response_headers.set('access-control-allow-credentials', 'true');
      new_response_headers.set('cache-control', 'public, max-age=14400');
      new_response_headers.delete('content-security-policy');
      new_response_headers.delete('content-security-policy-report-only');
      new_response_headers.delete('clear-site-data');

      // 添加这些行来处理编码问题
      new_response_headers.delete('content-encoding');
      new_response_headers.delete('content-length');
      
      // 处理响应内容，替换域名引用，使用有效主机名来决定域名后缀
      const modified_body = await modifyResponse(response_clone, host_prefix, effective_host);

      return {
        statusCode: response.status,
        headers: Object.fromEntries(new_response_headers.entries()),
        body: modified_body
      };

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        // 修改重定向URL以使用代理域名
        let new_location = location;
        for (const [original_domain, proxy_prefix] of Object.entries(domain_mappings)) {
          if (location.includes(original_domain)) {
            const domain_suffix = effective_host.substring(host_prefix.length);
            const full_proxy_domain = `${proxy_prefix}${domain_suffix}`;
            new_location = location.replace(original_domain, full_proxy_domain);
            break;
          }
        }
        res.setHeader('Location', new_location);
        return res.status(response.status).end();
      }
    }

    // 设置响应头
    const response_headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Cache-Control': 'public, max-age=14400'
    };

    // 复制原始响应头，但过滤掉一些特定的头
    const response_headers_to_skip = [
      'content-encoding',
      'content-length',
      'content-security-policy',
      'content-security-policy-report-only',
      'clear-site-data',
      'connection',
      'transfer-encoding'
    ];

    response.headers.forEach((value, key) => {
      const lower_key = key.toLowerCase();
      if (!response_headers_to_skip.includes(lower_key)) {
        response_headers[key] = value;
      }
    });

    // 设置所有响应头
    Object.entries(response_headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // 设置状态码
    res.status(response.status);

    // 处理响应内容
    const content_type = response.headers.get('content-type') || '';
    if (content_type.includes('text/') || 
        content_type.includes('application/json') || 
        content_type.includes('application/javascript') || 
        content_type.includes('application/xml')) {
      // 文本内容需要修改
      const modified_body = await modifyResponse(response.clone(), host_prefix, effective_host);
      res.send(modified_body);
    } else {
      // 二进制内容直接传输
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(502).json({ 
      error: 'Proxy Error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Netlify Function 配置在 netlify.toml 中设置