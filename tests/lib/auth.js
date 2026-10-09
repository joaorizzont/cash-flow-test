import http from 'k6/http';

const KEYCLOAK_URL = 'http://keycloak:8080';
const TOKEN_URL = `${KEYCLOAK_URL}/realms/cash-flow/protocol/openid-connect/token`;

export const tokenFor = (username) => {
  const response = http.post(TOKEN_URL, {
    grant_type: 'password',
    client_id: 'cash-flow-app',
    username,
    password: 'cashflow',
  });
  if (response.status !== 200) {
    throw new Error(`Could not authenticate ${username}: ${response.status} ${response.body}`);
  }
  return response.json('access_token');
};

export const authorized = (token, extra = {}) => ({
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra },
});
