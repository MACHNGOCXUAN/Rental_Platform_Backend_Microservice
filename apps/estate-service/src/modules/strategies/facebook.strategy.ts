import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy, Profile } from 'passport-facebook';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
    constructor(configService: ConfigService) {
        super({
            clientID: configService.get<string>('FACEBOOK_CLIENT_ID', ''),
            clientSecret: configService.get<string>('FACEBOOK_CLIENT_SECRET', ''),
            callbackURL: configService.get<string>('FACEBOOK_REDIRECT_URI', ''),
            scope: ['public_profile'], // 'email' cần được approve trong Facebook Developer Console
            profileFields: ['id', 'name', 'displayName', 'photos'],
        });
    }

    async validate(
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (error: any, user?: any) => void,
    ): Promise<any> {
        const { id, emails, name, photos, displayName } = profile;

        const user = {
            facebookId: id,
            email: emails?.[0]?.value || null,
            fullName: displayName || `${name?.familyName ?? ''} ${name?.givenName ?? ''}`.trim(),
            avatarUrl: photos?.[0]?.value,
        };

        done(null, user);
    }
}
