import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
	getAuthenticateOptions(context: ExecutionContext) {
		const req = context.switchToHttp().getRequest();
		const redirectUri =
			typeof req?.query?.redirect_uri === 'string'
				? req.query.redirect_uri
				: '';

		if (!redirectUri) {
			return {};
		}

		const state = Buffer.from(redirectUri, 'utf8').toString('base64url');
		return { state };
	}
}
